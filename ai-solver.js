/* Runs separately in every matched frame; no page-world key or network bridge. */
const AISolver = {
    busy:false, failures:new WeakMap(),
    text(el) { return (el?.innerText || el?.textContent || '').trim(); },
    visible(el) { return !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; },
    read(root) {
        const titleEl = root.querySelector('h3.mark_name, .Zy_TItle .clearfix, .Zy_TItle, .fontLabel, .mark_name');
        const title = this.text(titleEl);
        if (!title) return null;
        let nodes = [...root.querySelectorAll('.answerBg')];
        if (!nodes.length) nodes = [...root.querySelectorAll('.Zy_ulTop > li, .Zy_ulBottom > li, .answerList > li, .stem_answer > li')];
        nodes = nodes.filter(el => this.visible(el));
        const options = nodes.map((el,i) => {
            const labelEl = el.querySelector('.num_option, .num_option_dx');
            const raw = labelEl?.getAttribute('data') || this.text(labelEl) || this.text(el).match(/^([A-Z])[.、．\s]/)?.[1];
            const label = /^[A-Z]$/.test(raw || '') ? raw : String.fromCharCode(65+i);
            const text = this.text(el.querySelector('.answer_p, .after, .fl.after')) || this.text(el).replace(/^[A-Z][.、．\s]*/, '');
            return {label,text};
        });
        // Image-only / formula-image questions cannot be reliably answered as text.
        const imageOnly = [...root.querySelectorAll('img')].some(img => this.visible(img) && !img.alt?.trim());
        const fields = [...root.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')]
            .filter(el => this.visible(el) && !el.disabled && !el.readOnly);
        let type = /多选/.test(title) || root.querySelector('input[type="checkbox"], .num_option_dx') ? 'multiple' :
            /判断/.test(title) ? 'boolean' : options.length ? 'single' : /填空/.test(title) ? 'blank' : 'text';
        if (!options.length && !fields.length) return null;
        return {question:{title,type,options,blanks:options.length ? 0 : fields.length},nodes,fields,imageOnly};
    },
    selected(el) {
        const input = el.querySelector('input[type="radio"], input[type="checkbox"]');
        return !!input?.checked || !!el.querySelector('.check_answer, .check_answer_dx') ||
            el.matches('.check_answer, .check_answer_dx, [aria-checked="true"]');
    },
    signature(parsed) { return JSON.stringify(parsed.question); },
    note(root,text,error=false) {
        let note = root.querySelector('.cx-ai-result');
        if (!note) { note = document.createElement('div'); note.className='cx-ai-result'; root.appendChild(note); }
        note.textContent = text;
        note.style.cssText = `font:13px/1.6 sans-serif;padding:10px;margin:8px 0;border-radius:6px;background:${error?'#fff2e5':'#edf6ff'};color:#24324a;white-space:pre-wrap`;
    },
    async enabled() {
        const m = await chrome.storage.local.get(['cx_is_answering','cx_answer_source','cx_is_scraping','cx_is_learn_mode']);
        return m.cx_is_answering && m.cx_answer_source === 'deepseek' && !m.cx_is_scraping && !m.cx_is_learn_mode;
    },
    apply(parsed,answer) {
        const {question:q,nodes,fields} = parsed;
        if (q.options.length) {
            const wanted = new Set(answer.answers);
            if (!wanted.size || (q.type !== 'multiple' && wanted.size !== 1) || [...wanted].some(a => !q.options.some(o=>o.label===a))) return false;
            if (q.type === 'multiple') nodes.forEach((el,i) => {
                if (this.selected(el) !== wanted.has(q.options[i].label)) el.click();
            });
            else nodes[q.options.findIndex(o=>wanted.has(o.label))].click();
            return nodes.every((el,i) => this.selected(el) === wanted.has(q.options[i].label));
        }
        if (answer.answers.length !== fields.length) return false;
        fields.forEach((el,i) => {
            if (el.isContentEditable) el.textContent = answer.answers[i];
            else {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(proto,'value').set.call(el,answer.answers[i]);
            }
            el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        return true;
    },
    async run() {
        if (this.busy) return;
        this.busy = true;
        try {
            for (const root of document.querySelectorAll('.TiMu, .questionLi, .singleQuesId')) {
                if (!root.isConnected || !this.visible(root) || root.querySelector('.TiMu, .questionLi, .singleQuesId')) continue;
                const parsed = this.read(root);
                if (!parsed) continue;
                const sig = this.signature(parsed);
                if (root.dataset.cxAiSolved === sig || this.failures.get(root) === sig) continue;
                if (root.querySelector('.myAnswerBx .answerCon, .myAnswer .answerCon')) continue;
                if (parsed.imageOnly) { this.note(root,'包含未识别的图片，请手动处理。',true); this.failures.set(root,sig); continue; }
                if (!await this.enabled()) break;
                this.note(root,'DeepSeek 正在解析题目…');
                try {
                    const result = await chrome.runtime.sendMessage({type:'CX_AI_SOLVE',question:parsed.question});
                    if (!await this.enabled()) { this.note(root,'已停止，未填入返回答案。'); break; }
                    const current = root.isConnected && this.read(root);
                    if (!current || sig !== this.signature(current)) continue;
                    if (!result?.ok) throw new Error(result?.error || 'AI 连接失败');
                    if (!this.apply(current,result)) throw new Error('未能确认选项选中状态，请手动检查');
                    root.dataset.cxAiSolved = sig;
                    this.note(root,`AI 答案：${result.answers.join('、')}\n${result.explanation || ''}\n已填写，请检查后提交。`);
                } catch(e) { this.failures.set(root,sig); this.note(root,e.message,true); }
            }
        } finally { this.busy=false; }
    }
};
chrome.storage.onChanged.addListener((changes,area) => {
    if (area === 'local' && (changes.cx_is_answering || changes.cx_answer_source || changes.cx_ai_model)) AISolver.failures = new WeakMap();
});
