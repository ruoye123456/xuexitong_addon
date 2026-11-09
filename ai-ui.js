const AIUI = {
    inject(div) {
        const panel = div.querySelector('#panel-answer');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `<label style="display:block;margin-bottom:10px">答案来源<select id="cx-answer-source" style="width:100%;padding:6px;margin-top:6px"><option value="excel">本地 Excel 题库</option><option value="deepseek">DeepSeek V4.1 Flash</option></select></label><button id="cx-ai-options" style="width:100%;padding:8px;margin-bottom:8px;cursor:pointer">⚙ DeepSeek API 设置</button><p id="cx-ai-help" style="font-size:12px;line-height:1.6;display:none">自动扫描当前页及课程子框架中的题目，发送至 DeepSeek 后填写。答案和解析显示在题目下方；请检查后手动提交。遇到错误可停止后重新开启重试。</p>`;
        panel.prepend(wrapper);
        div.querySelector('#cx-answer-source').onchange = e => State.set({cx_answer_source:e.target.value,[KEYS.IS_ANSWERING]:false},()=>UI.updateState());
        div.querySelector('#cx-ai-options').onclick = async () => {
            try { await chrome.runtime.sendMessage({type:'CX_AI_OPEN'}); } catch { alert('请重新加载扩展并刷新页面'); }
        };
    },
    update(m) {
        const source = document.querySelector('#cx-answer-source');
        if (!source) return;
        source.value = m.cx_answer_source || 'excel';
        const ai = source.value === 'deepseek';
        for (const id of ['col-select','btn-load','bank-info']) document.getElementById(id).style.display = ai ? 'none' : '';
        document.querySelector('#cx-ai-help').style.display = ai ? 'block' : 'none';
    }
};
