(function () {
  'use strict';
  let lastMessage = '';
  function report(message) {
    const text = String(message || '알 수 없는 화면 오류').replace(/LIC-[\w-]+/g, '[인증 정보]').slice(0, 300);
    if (text === lastMessage) return;
    lastMessage = text;
    const show = () => {
      let box = document.getElementById('pfRuntimeError');
      if (!box) {
        box = document.createElement('section');
        box.id = 'pfRuntimeError'; box.setAttribute('role', 'alert');
        box.style.cssText = 'position:fixed;left:16px;bottom:64px;z-index:20000;max-width:min(540px,90vw);background:#fff1f2;color:#881337;border:1px solid #fda4af;border-radius:10px;padding:14px;font:13px/1.5 sans-serif;box-shadow:0 4px 20px #0003';
        const title = document.createElement('strong'); title.textContent = '화면 작업을 완료하지 못했습니다'; box.append(title);
        const detail = document.createElement('div'); detail.dataset.detail = ''; box.append(detail);
        const help = document.createElement('div'); help.textContent = '오류 내용을 확인한 뒤 다시 시도하세요. 반복되면 이 내용을 담당자에게 전달해 주세요.'; box.append(help);
        const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '오류 안내 닫기';
        dismiss.style.cssText = 'margin-top:8px;padding:4px 10px;border:1px solid #881337;border-radius:4px';
        dismiss.onclick = () => { box.remove(); lastMessage = ''; }; box.append(dismiss);
        document.body.append(box);
      }
      box.querySelector('[data-detail]').textContent = text;
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, {once: true});
  }
  window.addEventListener('error', event => {
    if (!event.message || event.message === 'Script error.') return;
    report(event.message);
  });
  window.addEventListener('unhandledrejection', event => {
    if (event.reason?.name === 'AbortError') return;
    report(event.reason?.message || event.reason);
  });
  window.PFRuntimeFeedback = {report};
})();
