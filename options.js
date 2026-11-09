const status = document.querySelector('#status');
async function send(message) {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw new Error(r?.error || '扩展连接失败');
    return r;
}
async function refresh() {
    const r = await send({type:'CX_AI_CONFIG'});
    document.querySelector('#model').value = r.model;
    status.textContent = r.hasKey ? '已设置密钥。可返回课程页面，选择 DeepSeek 并开启自动答题。' : '尚未设置密钥。';
}
document.querySelector('#save').onclick = async () => {
    try {
        await send({type:'CX_AI_SAVE',key:document.querySelector('#key').value,model:document.querySelector('#model').value});
        document.querySelector('#key').value = ''; await refresh();
    } catch(e) { status.textContent = e.message; }
};
document.querySelector('#delete').onclick = async () => {
    try { await send({type:'CX_AI_DELETE'}); await refresh(); } catch(e) { status.textContent = e.message; }
};
refresh().catch(e => status.textContent = e.message);
