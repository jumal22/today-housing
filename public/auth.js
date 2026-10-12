/* 오늘의 하우징 — 공용 로그인/회원가입 모듈
   plan3d.html · gallery.html · post.html 이 같이 가져다 쓴다. (고칠 땐 이 파일 하나만)
   - 상단 #loginBtn / #loginDropdown 안의 내용을 이 파일이 통째로 그린다.
   - 로그인 ↔ 회원가입 ↔ 비밀번호 찾기가 같은 창 안에서 높이 애니메이션과 함께 바뀐다.
   - Supabase 키를 아래 두 줄에 넣으면 실제 가입/로그인(이메일 + Google)이 동작한다.
     키가 비어 있으면 화면과 입력 검증만 동작한다(개발 중 모드). */
(function(){
  "use strict";

  /* ===== 설정 ===== */
  /* anon(공개) 키만 넣을 것. service_role 키는 절대 여기에 넣으면 안 된다. */
  var SUPABASE_URL = "https://axbdkuambarflaggyari.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_4sff9TbeCBs3Fy0wp0CfUw_zn29NCW3"; /* 공개용(publishable) 키 */
  var SUPABASE_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  var NAME_KEY = "oh-username"; /* 기존 게시 기능이 쓰는 이름 키 — 로그인하면 닉네임으로 맞춰준다 */

  var btn = document.getElementById("loginBtn");
  var dd = document.getElementById("loginDropdown");
  if (!btn || !dd) return;

  var configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  var sb = null;
  var currentUser = null;
  var currentProfile = null; /* profiles 테이블의 내 행 { nickname, role }  role: user / contractor / admin */
  var listeners = [];
  var pendingEmail = "";
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ===== 스타일 (페이지의 색 토큰을 그대로 사용 → 다크/라이트 자동 대응) ===== */
  var css = [
    ':root{--oh-danger:#B3392F; --oh-success:#3C7A5B;}',
    ':root[data-theme="dark"]{--oh-danger:#F28B82; --oh-success:#7BC79E;}',
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--oh-danger:#F28B82; --oh-success:#7BC79E;}}',
    '.login-dropdown{max-height:calc(100vh - 90px); overflow-y:auto; overscroll-behavior:contain;}',
    '.oh-auth-viewport{margin:-4px; padding:4px; overflow:hidden; transition:height .34s cubic-bezier(.4,0,.2,1);}',
    '.oh-auth-view{display:none; opacity:1; transition:opacity .11s ease;}',
    '.oh-auth-view.is-active{display:block;}',
    '.oh-auth-view.is-leaving,.oh-auth-view.is-entering{opacity:0;}',
    '.oh-auth-title{margin:0 0 6px; font-size:1.2rem; font-weight:700; color:var(--ink); letter-spacing:-.01em;}',
    '.oh-auth-sub{margin:0 0 20px; font-size:.88rem; line-height:1.55; color:var(--ink-soft);}',
    '.oh-auth-title + form{margin-top:18px;}',
    '.oh-f{position:relative;}',
    '.oh-inp{position:relative;}',
    '.oh-inp input{padding-right:46px;}',
    '.oh-eye{position:absolute; top:50%; right:6px; transform:translateY(-50%); width:34px; height:34px; border:0; background:none; border-radius:8px; color:var(--ink-soft); cursor:pointer; display:flex; align-items:center; justify-content:center;}',
    '.oh-eye:hover{color:var(--ink);}',
    '.oh-eye:focus-visible{outline:2px solid var(--focus); outline-offset:0;}',
    '.oh-err{display:block; font-style:normal; font-size:.8rem; line-height:1.4; color:var(--oh-danger); max-height:0; opacity:0; overflow:hidden; transition:max-height .22s ease, opacity .18s ease, margin-top .22s ease;}',
    '.has-err .oh-err{max-height:48px; opacity:1; margin-top:7px;}',
    '.has-err input:not([type="checkbox"]){border-color:var(--oh-danger);}',
    '.has-err input:not([type="checkbox"]):focus-visible{outline-color:var(--oh-danger);}',
    '.oh-hint{display:block; margin-top:8px; font-size:.78rem; color:var(--ink-soft);}',
    '.oh-meter{display:flex; gap:4px; margin-top:9px;}',
    '.oh-meter i{flex:1; height:4px; border-radius:2px; background:var(--line); transition:background .2s ease;}',
    '.oh-meter[data-s="1"] i:nth-child(-n+1){background:var(--oh-danger);}',
    '.oh-meter[data-s="2"] i:nth-child(-n+2){background:var(--terra);}',
    '.oh-meter[data-s="3"] i{background:var(--oh-success);}',
    '.oh-check{display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:.86rem; line-height:1.5; color:var(--ink-soft);}',
    '.oh-check input{width:18px; height:18px; margin:2px 0 0; flex:none; accent-color:var(--blueprint); cursor:pointer;}',
    '.oh-f.oh-terms{margin:2px 0 16px;}',
    '.oh-terms-row{display:flex; align-items:flex-start; gap:10px;}',
    '.oh-terms-row .oh-check{flex:1; min-width:0;}',
    '.oh-terms-open{flex:none; margin-top:1px; padding:0; border:0; background:none; font:inherit; font-size:.82rem; color:var(--ink-soft); text-decoration:underline; text-underline-offset:2px; white-space:nowrap; cursor:pointer;}',
    '.oh-terms-open:hover{color:var(--ink);}',
    '.oh-terms-open:focus-visible{outline:2px solid var(--focus); outline-offset:2px; border-radius:3px;}',
    '.oh-modal{position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(8,10,13,.55); opacity:0; visibility:hidden; transition:opacity .18s ease, visibility 0s linear .18s;}',
    '.oh-modal.open{opacity:1; visibility:visible; transition:opacity .18s ease, visibility 0s;}',
    '.oh-modal-card{width:min(640px,100%); max-height:min(760px, calc(100vh - 32px)); display:flex; flex-direction:column; background:var(--paper-raised); color:var(--ink); border:1px solid var(--line); border-radius:16px; box-shadow:0 24px 60px -18px var(--shadow); transform:translateY(10px) scale(.97); transition:transform .26s cubic-bezier(.2,.9,.3,1.1);}',
    '.oh-modal.open .oh-modal-card{transform:none;}',
    '.oh-modal-head{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:20px 24px 0;}',
    '.oh-modal-title{margin:0; font-size:1.1rem; font-weight:700;}',
    '.oh-modal-x{width:34px; height:34px; border:0; border-radius:8px; background:none; color:var(--ink-soft); cursor:pointer; display:flex; align-items:center; justify-content:center; flex:none;}',
    '.oh-modal-x:hover{color:var(--ink); background:var(--paper);}',
    '.oh-modal-x:focus-visible,.oh-tab:focus-visible{outline:2px solid var(--focus); outline-offset:2px;}',
    '.oh-tabs{display:flex; gap:6px; padding:14px 24px 0; border-bottom:1px solid var(--line);}',
    '.oh-tab{appearance:none; border:0; background:none; font:inherit; font-size:.9rem; font-weight:600; color:var(--ink-soft); padding:9px 12px; margin-bottom:-1px; border-bottom:2px solid transparent; cursor:pointer;}',
    '.oh-tab:hover{color:var(--ink);}',
    '.oh-tab[aria-selected="true"]{color:var(--blueprint); border-bottom-color:var(--blueprint);}',
    '.oh-modal-body{padding:6px 24px 18px; overflow-y:auto; overscroll-behavior:contain; flex:1;}',
    '.oh-doc[hidden]{display:none;}',
    '.oh-doc h4{margin:20px 0 6px; font-size:.95rem; color:var(--ink);}',
    '.oh-doc p,.oh-doc li{font-size:.88rem; line-height:1.75; color:var(--ink-soft);}',
    '.oh-doc p{margin:0 0 6px;}',
    '.oh-doc ol,.oh-doc ul{margin:0 0 6px; padding-left:20px;}',
    '.oh-doc .oh-meta{font-size:.8rem; margin-bottom:0;}',
    '.oh-modal-foot{display:flex; justify-content:flex-end; gap:10px; padding:14px 24px 20px; border-top:1px solid var(--line);}',
    '.oh-modal-foot .oh-secondary{width:auto; padding:9px 18px; font-size:.88rem;}',
    '.oh-modal-foot .btn{padding:9px 18px;}',
    '@media (prefers-reduced-motion:reduce){.oh-modal,.oh-modal-card{transition:none; transform:none;}}',
    '.oh-note{display:none; margin:0 0 14px; padding:10px 12px; border-radius:10px; font-size:.84rem; line-height:1.5;}',
    '.oh-note.show{display:block;}',
    '.oh-note.is-err{color:var(--oh-danger); background:color-mix(in srgb, var(--oh-danger) 10%, transparent); border:1px solid color-mix(in srgb, var(--oh-danger) 35%, transparent);}',
    '.oh-note.is-info{color:var(--ink-soft); background:var(--paper); border:1px solid var(--line);}',
    '.oh-or{display:flex; align-items:center; gap:12px; margin:18px 0 14px; font-size:.8rem; color:var(--ink-soft);}',
    '.oh-or::before,.oh-or::after{content:""; flex:1; height:1px; background:var(--line);}',
    '.oh-google,.oh-secondary{width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:12px 16px; border-radius:10px; border:1.5px solid var(--line); background:var(--paper); color:var(--ink); font:inherit; font-size:.95rem; font-weight:500; cursor:pointer; transition:border-color .15s ease, background .15s ease;}',
    '.oh-google:hover,.oh-secondary:hover{border-color:var(--ink-soft);}',
    '.oh-google:focus-visible,.oh-secondary:focus-visible{outline:2px solid var(--focus); outline-offset:2px;}',
    '.oh-google[disabled],.login-submit[disabled]{opacity:.6; cursor:progress;}',
    '.oh-center{text-align:center;}',
    '.oh-mailicon{width:52px; height:52px; margin:2px auto 14px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--blueprint-soft); color:var(--blueprint);}',
    '.oh-account{display:flex; align-items:center; gap:14px; margin-bottom:20px;}',
    '.oh-avatar{width:46px; height:46px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center; background:var(--blueprint); color:#fff; font-weight:700; font-size:1.1rem;}',
    '.oh-acc-text{min-width:0; flex:1; display:flex; flex-direction:column; gap:3px;}',
    '.oh-nick-btn{flex:none; height:28px; padding:0 8px; display:inline-flex; align-items:center; gap:5px; margin-left:auto; white-space:nowrap; border:0; border-radius:8px; background:transparent; color:var(--ink-soft); font:inherit; font-size:.8rem; font-weight:600; cursor:pointer; transition:background .15s, color .15s;}',
    '.oh-nick-btn:hover{background:var(--blueprint-soft); color:var(--blueprint);}',
    '.oh-nick-btn:focus-visible{outline:2px solid var(--focus); outline-offset:2px;}',
    '.oh-acc-row{display:flex; align-items:center; gap:8px; min-width:0;}',
    '.oh-badge-admin{flex:none; padding:2px 9px; border-radius:999px; font-size:.74rem; font-weight:600; line-height:1.5; background:var(--blueprint-soft); color:var(--blueprint-deep); border:1px solid color-mix(in srgb, var(--blueprint) 35%, transparent);}',
    '.oh-badge-admin[hidden]{display:none;}',
    'a.oh-badge-admin{text-decoration:none; cursor:pointer; transition:background .15s;}',
    'a.oh-badge-admin:hover{background:color-mix(in srgb, var(--blueprint) 22%, var(--paper-raised));}',
    'a.oh-badge-admin:focus-visible{outline:2px solid var(--focus); outline-offset:2px;}',
    '.oh-badge-pro{flex:none; padding:2px 9px; border-radius:999px; font-size:.74rem; font-weight:600; line-height:1.5; background:color-mix(in srgb, var(--oh-success) 14%, var(--paper-raised)); color:var(--oh-success); border:1px solid color-mix(in srgb, var(--oh-success) 35%, transparent);}',
    '.oh-badge-pro[hidden]{display:none;}',
    '.oh-login-backdrop{position:fixed; inset:0; z-index:2000; background:rgba(8,10,13,.55);}',
    '.login-dropdown.oh-as-modal{position:fixed !important; top:50% !important; left:50% !important; right:auto !important; bottom:auto !important; transform:translate(-50%,-50%) !important; z-index:2001 !important; width:min(430px, calc(100vw - 32px)); max-height:calc(100vh - 32px); margin:0;}',
    '.oh-acc-name{font-size:1.02rem; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
    '.oh-acc-mail{font-size:.82rem; color:var(--ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
    '#loginBtn{max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
    '.oh-linkbtn{display:block; margin:-6px 0 14px; padding:0; border:0; background:none; font:inherit; font-size:.84rem; color:var(--blueprint); text-decoration:underline; text-underline-offset:2px; cursor:pointer;}',
    '.oh-linkbtn[hidden]{display:none;}',
    '.oh-linkbtn[disabled],.oh-resend[disabled]{opacity:.6; cursor:default; text-decoration:none;}',
    '.oh-resend{margin-bottom:16px;}',
    '.oh-toast{position:fixed; left:50%; bottom:28px; z-index:1100; max-width:min(440px, calc(100vw - 32px)); padding:12px 18px; border-radius:12px; background:var(--ink); color:var(--paper); font-size:.9rem; line-height:1.5; box-shadow:0 14px 36px -14px var(--shadow); transform:translate(-50%,16px); opacity:0; pointer-events:none; transition:opacity .2s ease, transform .3s cubic-bezier(.2,.9,.3,1.1);}',
    '.oh-toast.show{opacity:1; transform:translate(-50%,0);}',
    '@media (prefers-reduced-motion:reduce){.oh-toast{transition:opacity .1s linear; transform:translate(-50%,0);}}',
    '@keyframes ohAuthShake{0%,100%{transform:translateX(0);}20%{transform:translateX(-7px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(3px);}}',
    '.oh-auth-view.oh-shake,.oh-modal-card.oh-shake{animation:ohAuthShake .38s ease;}',
    '@media (prefers-reduced-motion:reduce){.oh-auth-viewport,.oh-auth-view,.oh-err,.oh-meter i{transition:none;}.oh-auth-view.oh-shake{animation:none;}}'
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.setAttribute("data-oh-auth", "");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ===== 마크업 ===== */
  var EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>';
  var EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 5.2A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.5 6.6A16.6 16.6 0 002 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 004.2 4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var GOOGLE = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 019.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 000 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  var PENCIL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 000-3L17 5a2.1 2.1 0 00-3 0L4 15.5V20z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12.5 6.5l5 5" stroke="currentColor" stroke-width="1.7"/></svg>';
  var MAIL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 7l8.5 6 8.5-6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function field(name, label, type, ac, ph, extra){
    var eye = type === "password"
      ? '<button type="button" class="oh-eye" aria-label="비밀번호 보기" aria-pressed="false">' + EYE + '</button>' : "";
    return '<label class="login-field oh-f" data-f="' + name + '"><span>' + label + '</span>' +
      '<div class="oh-inp"><input type="' + type + '" name="' + name + '" autocomplete="' + ac + '" placeholder="' + ph + '"' + (extra && extra.attrs ? " " + extra.attrs : "") + '>' + eye + '</div>' +
      '<em class="oh-err" role="alert"></em>' + (extra && extra.after ? extra.after : "") + '</label>';
  }
  function submitBtn(text){
    return '<button type="submit" class="btn btn-primary btn-sm login-submit" data-label="' + text + '">' + text + '</button>';
  }
  var googleBtn = '<button type="button" class="oh-google" data-act="google">' + GOOGLE + '<span>Google로 계속하기</span></button>';

  var html = '<div class="oh-auth-viewport" id="ohAuthViewport">' +
    /* 로그인 */
    '<div class="oh-auth-view is-active" data-view="login">' +
      '<h3 class="oh-auth-title">로그인</h3>' +
      '<form novalidate data-form="login"><p class="oh-note" role="status"></p>' +
        '<button type="button" class="oh-linkbtn" data-act="resend-login" data-label="인증 메일 다시 보내기" hidden>인증 메일 다시 보내기</button>' +
        field("email", "이메일", "email", "email", "name@email.com") +
        field("password", "비밀번호", "password", "current-password", "비밀번호를 입력하세요") +
        submitBtn("로그인") +
      '</form>' +
      '<div class="oh-or"><span>또는</span></div>' + googleBtn +
      '<div class="login-links"><a href="#" data-go="signup">회원가입</a><span aria-hidden="true">·</span><a href="#" data-go="forgot">비밀번호 찾기</a></div>' +
    '</div>' +
    /* 회원가입 */
    '<div class="oh-auth-view" data-view="signup">' +
      '<h3 class="oh-auth-title">회원가입</h3>' +
      '<p class="oh-auth-sub">가입하면 내 도면을 갤러리에 올리고, 다른 사람의 의견을 받을 수 있어요.</p>' +
      '<form novalidate data-form="signup"><p class="oh-note" role="status"></p>' +
        field("email", "이메일", "email", "email", "name@email.com") +
        field("password", "비밀번호", "password", "new-password", "8자 이상, 영문+숫자", {
          after: '<div class="oh-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i></div>' }) +
        field("nickname", "닉네임", "text", "nickname", "2~12자, 한글·영문·숫자", { attrs: 'maxlength="12"' }) +
        '<div class="oh-f oh-terms" data-f="terms"><div class="oh-terms-row"><label class="oh-check"><input type="checkbox" name="terms"><span>서비스 이용과 개인정보 수집에 동의해요 (필수)</span></label><button type="button" class="oh-terms-open" data-act="terms">전문 보기</button></div><em class="oh-err" role="alert"></em></div>' +
        submitBtn("가입하기") +
      '</form>' +
      '<div class="oh-or"><span>또는</span></div>' + googleBtn +
      '<div class="login-links"><span>이미 계정이 있나요?</span><a href="#" data-go="login">로그인</a></div>' +
    '</div>' +
    /* 비밀번호 찾기 */
    '<div class="oh-auth-view" data-view="forgot">' +
      '<h3 class="oh-auth-title">비밀번호 찾기</h3>' +
      '<p class="oh-auth-sub">가입한 이메일로 비밀번호를 다시 정하는 링크를 보내드려요.</p>' +
      '<form novalidate data-form="forgot"><p class="oh-note" role="status"></p>' +
        field("email", "이메일", "email", "email", "name@email.com") +
        submitBtn("재설정 메일 보내기") +
      '</form>' +
      '<div class="login-links"><a href="#" data-go="login">← 로그인으로 돌아가기</a></div>' +
    '</div>' +
    /* 메일 안내 */
    '<div class="oh-auth-view oh-center" data-view="sent">' +
      '<div class="oh-mailicon">' + MAIL + '</div>' +
      '<h3 class="oh-auth-title" data-sent-title>메일을 확인해 주세요</h3>' +
      '<p class="oh-auth-sub" data-sent-text></p>' +
      '<button type="button" class="oh-secondary oh-resend" data-act="resend-sent" data-label="메일 다시 보내기">메일 다시 보내기</button>' +
      '<div class="login-links"><a href="#" data-go="login">로그인 화면으로</a><span aria-hidden="true">·</span><a href="#" data-go="signup" data-sent-back>이메일 다시 입력</a></div>' +
    '</div>' +
    /* 새 비밀번호 */
    '<div class="oh-auth-view" data-view="reset">' +
      '<h3 class="oh-auth-title">새 비밀번호 설정</h3>' +
      '<form novalidate data-form="reset"><p class="oh-note" role="status"></p>' +
        field("password", "새 비밀번호", "password", "new-password", "8자 이상, 영문+숫자", {
          after: '<div class="oh-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i></div>' }) +
        submitBtn("비밀번호 변경") +
      '</form>' +
    '</div>' +
    /* 회원정보 수정 1단계: 현재 비밀번호 확인 */
    '<div class="oh-auth-view" data-view="verify">' +
      '<h3 class="oh-auth-title">회원정보 수정</h3>' +
      '<p class="oh-auth-sub">본인 확인을 위해 현재 비밀번호를 입력해 주세요.</p>' +
      '<form novalidate data-form="verify"><p class="oh-note" role="status"></p>' +
        field("current", "현재 비밀번호", "password", "current-password", "지금 쓰는 비밀번호") +
        submitBtn("확인") +
      '</form>' +
      '<div class="login-links"><a href="#" data-go="account">← 돌아가기</a></div>' +
    '</div>' +
    /* 회원정보 수정 2단계: 닉네임 · 비밀번호 */
    '<div class="oh-auth-view" data-view="profile">' +
      '<h3 class="oh-auth-title">회원정보 수정</h3>' +
      '<form novalidate data-form="profile"><p class="oh-note" role="status"></p>' +
        field("nickname", "닉네임", "text", "nickname", "2~12자, 한글·영문·숫자", { attrs: 'maxlength="12"' }) +
        field("password", "새 비밀번호 (바꿀 때만)", "password", "new-password", "8자 이상, 영문+숫자", {
          after: '<div class="oh-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i></div>' }) +
        submitBtn("저장") +
      '</form>' +
      '<div class="login-links"><a href="#" data-go="account">← 돌아가기</a></div>' +
    '</div>' +
    /* 로그인된 상태 */
    '<div class="oh-auth-view" data-view="account">' +
      '<div class="oh-account"><span class="oh-avatar" data-avatar></span><div class="oh-acc-text"><div class="oh-acc-row"><strong class="oh-acc-name" data-acc-name></strong><a class="oh-badge-admin" data-acc-badge href="/admin.html" title="관리자 페이지로 이동" hidden>🛡️ 관리자 ›</a><span class="oh-badge-pro" data-acc-pro hidden>인테리어 업자</span><button type="button" class="oh-nick-btn" data-act="nick-edit" aria-label="회원정보 수정">' + PENCIL + '<span>회원정보 수정</span></button></div><small class="oh-acc-mail" data-acc-mail></small>' +
      '</div></div>' +
      '<button type="button" class="oh-secondary" data-act="logout">로그아웃</button>' +
    '</div>' +
  '</div>';
  dd.innerHTML = html;

  var vp = dd.querySelector("#ohAuthViewport");

  /* ===== 검증 ===== */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function vEmail(v){
    v = (v || "").trim();
    if (!v) return "이메일을 입력해 주세요.";
    if (!EMAIL_RE.test(v)) return "이메일 형식이 맞지 않아요. (예: name@email.com)";
    return "";
  }
  function vPwNew(v){
    if (!v) return "비밀번호를 입력해 주세요.";
    if (v.length < 8) return "8자 이상으로 입력해 주세요.";
    if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "영문과 숫자를 함께 써 주세요.";
    return "";
  }
  function vPwAny(v){ return v ? "" : "비밀번호를 입력해 주세요."; }
  function vNick(v){
    v = (v || "").trim();
    if (!v) return "닉네임을 입력해 주세요.";
    if (v.length < 2 || v.length > 12) return "2~12자로 입력해 주세요.";
    if (!/^[0-9A-Za-z_가-힣]+$/.test(v)) return "한글, 영문, 숫자, _ 만 쓸 수 있어요.";
    return "";
  }
  var RULES = {
    login:  { email: vEmail, password: vPwAny },
    signup: { email: vEmail, password: vPwNew, nickname: vNick, terms: function(v, el){ return el.checked ? "" : "동의가 필요해요."; } },
    verify: { current: vPwAny },
    welcome:{ nickname: vNick, terms: function(v, el){ return el.checked ? "" : "동의가 필요해요."; } },
    profile:{ nickname: vNick, password: function(v){ return v ? vPwNew(v) : ""; } },
    forgot: { email: vEmail },
    reset:  { password: vPwNew }
  };

  function strength(pw){
    var s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++;
    if (pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)) s++;
    return pw ? Math.max(1, s) : 0;
  }

  function fieldBox(form, name){ return form.querySelector('[data-f="' + name + '"]'); }
  function setErr(form, name, msg){
    var box = fieldBox(form, name);
    if (!box) return;
    var em = box.querySelector(".oh-err");
    var input = box.querySelector("input");
    box.classList.toggle("has-err", !!msg);
    if (em) em.textContent = msg || "";
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function checkField(form, name){
    var rules = RULES[form.getAttribute("data-form")] || {};
    var box = fieldBox(form, name);
    var input = box && box.querySelector("input");
    if (!rules[name] || !input) return "";
    var msg = rules[name](input.type === "checkbox" ? "" : input.value, input);
    setErr(form, name, msg);
    return msg;
  }
  function checkAll(form){
    var rules = RULES[form.getAttribute("data-form")] || {};
    var first = "";
    Object.keys(rules).forEach(function(name){
      if (checkField(form, name) && !first) first = name;
    });
    return first; /* 처음 틀린 칸 이름, 전부 통과면 "" */
  }
  function note(form, text, kind){
    var el = form.querySelector(".oh-note");
    if (!el) return;
    el.className = "oh-note" + (text ? " show is-" + (kind || "err") : "");
    el.textContent = text || "";
  }
  function busy(form, on){
    var b = form.querySelector(".login-submit");
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? "처리 중…" : b.getAttribute("data-label");
  }

  function mapError(err){
    var m = (err && (err.message || err.error_description || err.msg)) || "";
    if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 맞지 않아요.";
    if (/email not confirmed/i.test(m)) return "메일 인증이 아직 안 됐어요. 받은 편지함을 확인해 주세요.";
    if (/already registered|already been registered/i.test(m)) return "이미 가입된 이메일이에요. 로그인해 보세요.";
    if (/password should be at least|weak password/i.test(m)) return "비밀번호가 너무 약해요. 조금 더 길게 만들어 주세요.";
    if (/rate limit|too many|after \d+ seconds/i.test(m)) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    if (/failed to fetch|network/i.test(m)) return "네트워크 연결을 확인해 주세요.";
    if (/reauthenticat|recently/i.test(m)) return "보안을 위해 한 번 로그아웃했다가 다시 로그인한 뒤 바꿔 주세요.";
    if (/same password|different from the old/i.test(m)) return "이전과 다른 비밀번호를 써 주세요.";
    return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
  }

  /* ===== 화면 전환 (같은 창이 높이를 바꾸며 다른 화면으로) ===== */
  var swapTimer = null, heightTimer = null;
  var IS_POPUP = /[?&]oh-popup=1(&|$)/.test(location.search);   /* 구글 로그인용 팝업 (구글을 거치면 opener 가 끊길 수 있어 주소로만 판단) */
  var popupClosing = false;
  function popupDone(){
    setTimeout(function(){
      try { window.close(); } catch (e) {}
      setTimeout(function(){
        document.body.innerHTML = '<div style="font:16px/1.7 sans-serif;padding:48px 28px;text-align:center;color:#444"><strong style="font-size:1.15rem">로그인됐어요</strong><br>이 창은 닫아도 돼요.</div>';
      }, 400);
    }, 250);
  }
  function activeView(){ return vp.querySelector(".oh-auth-view.is-active"); }
  function focusFirst(view){
    var el = view.querySelector("input:not([type=checkbox]), .oh-secondary:not(.oh-resend)");
    if (el && dd.classList.contains("open")) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }
  function resetForms(view){
    view.querySelectorAll("form").forEach(function(f){
      note(f, "");
      f.querySelectorAll(".has-err").forEach(function(b){ b.classList.remove("has-err"); });
    });
  }
  /* 화면을 떠날 때 그 화면의 입력값·오류·비밀번호 보기 상태·강도 막대를 처음 상태로 */
  function clearView(view){
    view.classList.remove("oh-shake");
    view.querySelectorAll("form").forEach(function(f){
      f.reset();
      note(f, "");
      f.querySelectorAll(".has-err").forEach(function(b){ b.classList.remove("has-err"); });
      f.querySelectorAll("input").forEach(function(i){ i.setAttribute("aria-invalid", "false"); });
      f.querySelectorAll(".oh-eye").forEach(function(eye){
        var inp = eye.parentNode.querySelector("input");
        if (inp) inp.type = "password";
        eye.innerHTML = EYE;
        eye.setAttribute("aria-pressed", "false");
        eye.setAttribute("aria-label", "비밀번호 보기");
      });
      f.querySelectorAll(".oh-meter").forEach(function(m){ m.setAttribute("data-s", "0"); });
      f.querySelectorAll('[data-act="resend-login"]').forEach(function(b){ b.hidden = true; });
    });
  }
  function show(name){
    var cur = activeView();
    var next = vp.querySelector('[data-view="' + name + '"]');
    if (!next || cur === next) return;
    clearTimeout(swapTimer); clearTimeout(heightTimer);
    resetForms(next);
    next.classList.remove("oh-shake");

    if (reduceMotion || !dd.classList.contains("open")){
      cur.classList.remove("is-active", "is-leaving");
      clearView(cur);
      next.classList.add("is-active");
      vp.style.height = "";
      return;
    }
    vp.style.height = vp.offsetHeight + "px";
    cur.classList.add("is-leaving");
    swapTimer = setTimeout(function(){
      cur.classList.remove("is-active", "is-leaving");
      clearView(cur);
      next.classList.add("is-active", "is-entering");
      vp.style.height = next.offsetHeight + "px";
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){ next.classList.remove("is-entering"); });
      });
      heightTimer = setTimeout(function(){ vp.style.height = ""; focusFirst(next); }, 360);
    }, 115);
  }
  function shake(view){
    if (reduceMotion) return;
    view.classList.remove("oh-shake");
    void view.offsetWidth;
    view.classList.add("oh-shake");
    /* 한 번 흔들고 나면 클래스를 떼어 둔다 — 안 그러면 이 화면이 다시 보일 때마다 또 흔들린다 */
    clearTimeout(view._shakeT);
    view._shakeT = setTimeout(function(){ view.classList.remove("oh-shake"); }, 420);
  }

  /* ===== 로그인 상태 반영 ===== */
  function nickOf(user){
    var md = (user && user.user_metadata) || {};
    return (md.nickname || md.full_name || md.name || ((user.email || "").split("@")[0]) || "회원").trim();
  }
  var NICK_CACHE = "oh-nick-cache"; /* 프로필이 오기 전에 옛 닉네임이 잠깐 비치지 않도록 마지막 닉네임을 기억 */
  function cachedNick(user){
    try {
      var c = JSON.parse(localStorage.getItem(NICK_CACHE) || "null");
      return (c && user && c.id === user.id && c.nick) ? c.nick : "";
    } catch (e) { return ""; }
  }
  /* 로그인 버튼과 계정 화면에 닉네임(+관리자 표시)을 그린다 */
  function renderIdentity(){
    var acc = vp.querySelector('[data-view="account"]');
    if (!currentUser){ btn.textContent = "로그인"; return; }
    var nick = (currentProfile && currentProfile.nickname) || cachedNick(currentUser) || nickOf(currentUser);
    if (currentProfile && currentProfile.nickname){
      try { localStorage.setItem(NICK_CACHE, JSON.stringify({ id: currentUser.id, nick: currentProfile.nickname })); } catch (e) {}
    }
    var role = (currentProfile && currentProfile.role) || "user";
    var admin = role === "admin", pro = role === "contractor";
    btn.textContent = nick + (admin ? " 🛡️" : "");
    btn.setAttribute("title", admin ? "관리자 계정" : (pro ? "인테리어 업자 계정" : ""));
    acc.querySelector("[data-avatar]").textContent = nick.charAt(0).toUpperCase();
    acc.querySelector("[data-acc-name]").textContent = nick;
    acc.querySelector("[data-acc-badge]").hidden = !admin;
    acc.querySelector("[data-acc-pro]").hidden = !pro;
    acc.querySelector("[data-acc-mail]").textContent = currentUser.email || "";
    try { localStorage.setItem(NAME_KEY, nick); } catch (e) {}
  }
  function notifyChange(){
    listeners.forEach(function(fn){ try { fn(currentUser, currentProfile); } catch (e) {} });
  }
  function fetchProfile(user){
    if (!sb || !user) return Promise.resolve(null);
    return sb.from("profiles").select("nickname, role").eq("id", user.id).maybeSingle()
      .then(function(r){ return (r && !r.error && r.data) ? r.data : null; })
      .catch(function(){ return null; });
  }
  function applyUser(user){
    currentUser = user || null;
    currentProfile = null;
    if (user){
      renderIdentity(); /* 우선 가입 때 쓴 닉네임으로 보여주고, 서버 프로필이 오면 다시 그린다 */
      if (needsWelcome(user)) openWelcome(); else closeWelcome();
      if (verifiedPending){
        verifiedPending = false;
        openDropdown();
        toast("이메일 인증이 끝났어요. 환영해요, " + nickOf(user) + "님!");
      }
      var v = activeView();
      if (v && v.getAttribute("data-view") !== "account" && v.getAttribute("data-view") !== "reset" && v.getAttribute("data-view") !== "profile" && v.getAttribute("data-view") !== "verify") show("account");
      var uid = user.id;
      fetchProfile(user).then(function(p){
        if (!currentUser || currentUser.id !== uid) return; /* 그 사이 로그아웃/계정 전환 */
        currentProfile = p;
        renderIdentity();
        notifyChange();
      });
    } else {
      renderIdentity();
      var v2 = activeView();
      if (v2 && v2.getAttribute("data-view") === "account") show("login");
    }
    notifyChange();
  }

  /* ===== Supabase ===== */
  function loadSupabase(){
    return new Promise(function(resolve, reject){
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement("script");
      s.src = SUPABASE_SRC; s.async = true;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error("failed to fetch supabase-js")); };
      document.head.appendChild(s);
    });
  }
  /* 비회원 임시 세션(익명 로그인)은 "로그인한 상태"로 치지 않는다 — 글 올리기용으로만 쓰는 세션 */
  var rawUser = null;
  function memberOnly(u){ return (u && !u.is_anonymous) ? u : null; }
  function ensureGuest(){
    return ready.then(function(c){
      if (!c) return null;
      if (rawUser) return rawUser;
      return c.auth.signInAnonymously().then(function(r){
        if (r.error || !r.data || !r.data.user) return null;
        rawUser = r.data.user;
        return rawUser;
      }, function(){ return null; });
    });
  }
  function initSupabase(){
    if (!configured) return Promise.resolve(null);
    return loadSupabase().then(function(){
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      sb.auth.onAuthStateChange(function(event, session){
        rawUser = (session && session.user) || null;
        if (IS_POPUP && session && (event === "SIGNED_IN" || event === "INITIAL_SESSION") && memberOnly(rawUser) && !popupClosing){ popupClosing = true; popupDone(); }
        applyUser(memberOnly(rawUser));
        if (event === "PASSWORD_RECOVERY"){
          dd.classList.add("open"); btn.setAttribute("aria-expanded", "true");
          show("reset");
        }
      });
      return sb.auth.getSession().then(function(r){
        rawUser = (r && r.data && r.data.session && r.data.session.user) || null;
        applyUser(memberOnly(rawUser));
        return sb;
      });
    }).catch(function(err){ console.error("[auth] supabase 초기화 실패", err); return null; });
  }
  var ready = initSupabase();

  function openDropdown(){
    dd.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  }
  var verifiedPending = false;
  (function handleReturnFromMail(){
    var u = new URL(location.href);
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    var errCode = h.get("error_code") || u.searchParams.get("error_code") || "";
    if (u.searchParams.get("oh-verified") === "1") verifiedPending = true;
    if (errCode){
      var desc = (h.get("error_description") || u.searchParams.get("error_description") || "");
      var expired = /expired|invalid/i.test(errCode + " " + desc);
      setTimeout(function(){
        openDropdown();
        toast(expired ? "인증 링크가 만료됐거나 이미 사용됐어요. 로그인하면 메일을 다시 받을 수 있어요."
                      : "인증에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }, 700);
    }
    if (verifiedPending || errCode){
      ready.then(function(){
        /* 세션 처리가 끝난 뒤 주소창의 인증 흔적을 정리 */
        var c = new URL(location.href);
        ["oh-verified", "error", "error_code", "error_description"].forEach(function(k){ c.searchParams.delete(k); });
        try { history.replaceState(null, "", c.pathname + c.search); } catch (e) {}
        /* 다른 기기/브라우저에서 링크를 열어 자동 로그인이 안 된 경우 */
        if (verifiedPending && !currentUser){
          verifiedPending = false;
          openDropdown();
          toast("이메일 인증이 끝났어요. 이제 로그인해 주세요.");
        }
      });
    }
  })();

  function devNote(form){
    note(form, "아직 서버 연결 전이에요. 지금은 화면과 입력 검증만 동작해요.", "info");
  }
  /* 메일 링크를 눌러 돌아올 주소. 이전 인증/오류 흔적(code, error_*, oh-verified)은 떼고,
     가입 확인 메일에만 oh-verified=1 을 붙여서 돌아왔을 때 "인증 완료"를 알려준다. */
  function redirectBase(verified){
    var u = new URL(location.href);
    u.hash = "";
    ["code", "error", "error_code", "error_description", "oh-verified", "oh-popup"].forEach(function(k){ u.searchParams.delete(k); });
    if (verified) u.searchParams.set("oh-verified", "1");
    return u.toString();
  }

  function nicknameTaken(nick){
    if (!sb) return Promise.resolve(false);
    /* profiles 테이블이 아직 없거나 조회가 막혀 있으면 "사용 가능"으로 보고 넘어간다 */
    return sb.from("profiles").select("id", { count: "exact", head: true }).ilike("nickname", nick.replace(/[\\%_]/g, "\\$&"))
      .then(function(r){ return !r.error && (r.count || 0) > 0; })
      .catch(function(){ return false; });
  }

  function doLogin(form){
    var email = form.email.value.trim(), pw = form.password.value;
    if (!configured) return devNote(form);
    busy(form, true);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return c.auth.signInWithPassword({ email: email, password: pw });
    }).then(function(r){
      if (r.error) throw r.error;
      form.reset(); note(form, "");
    }).catch(function(err){
      note(form, mapError(err), "err"); shake(activeView());
      if (/email not confirmed/i.test((err && err.message) || "")){
        pendingEmail = email;
        var rb = form.querySelector('[data-act="resend-login"]');
        if (rb) rb.hidden = false;
      }
    }).then(function(){ busy(form, false); });
  }

  function doSignup(form){
    var email = form.email.value.trim(), nick = form.nickname.value.trim(), pw = form.password.value;
    if (!configured) return devNote(form);
    busy(form, true);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return nicknameTaken(nick).then(function(taken){
        if (taken){ setErr(form, "nickname", "이미 사용 중인 닉네임이에요."); shake(activeView()); return null; }
        return c.auth.signUp({ email: email, password: pw,
          options: { data: { nickname: nick }, emailRedirectTo: redirectBase(true) } })
          .then(function(r){
            if (r.error) throw r.error;
            /* 이미 가입된 이메일이면 Supabase가 에러 대신 identities 가 빈 사용자를 돌려준다 */
            if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0){
              throw new Error("User already registered");
            }
            form.reset();
            vp.querySelector(".oh-meter").setAttribute("data-s", "0");
            if (!r.data.session){ showSent("signup", "가입 확인 메일을 보냈어요", email, "메일 속 링크를 누르면 가입이 끝나요."); }
          });
      });
    }).catch(function(err){
      note(form, mapError(err), "err"); shake(activeView());
    }).then(function(){ busy(form, false); });
  }

  /* ===== 내 정보 수정 (닉네임 · 비밀번호) ===== */
  /* 연필 → 1단계(현재 비밀번호 확인) → 2단계(닉네임·비밀번호 수정). 이메일 가입이 아닌 계정(구글 등)은 확인할 비밀번호가 없어서 바로 2단계 */
  function usesPassword(){
    var ids = (currentUser && currentUser.identities) || [];
    var p = currentUser && currentUser.app_metadata && currentUser.app_metadata.provider;
    return !!(currentUser && currentUser.email && (p === "email" || ids.some(function(i){ return i.provider === "email"; })));
  }
  function openProfile(){
    if (!usesPassword()) return openProfileEdit();
    var vf = vp.querySelector("form[data-form=verify]");
    vf.current.value = "";
    show("verify");
  }
  function openProfileEdit(){
    var form = vp.querySelector("form[data-form=profile]");
    form.nickname.value = (currentProfile && currentProfile.nickname) || cachedNick(currentUser) || nickOf(currentUser);
    form.password.value = "";
    form.querySelector(".oh-meter").setAttribute("data-s", "0");
    show("profile");
  }
  /* 지금 로그인 세션은 건드리지 않는 임시 클라이언트로 현재 비밀번호만 확인 */
  function doVerify(form){
    if (!configured || !currentUser) return;
    busy(form, true);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      var tmp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      return tmp.auth.signInWithPassword({ email: currentUser.email, password: form.current.value }).then(function(r){
        if (r.error){
          if (/invalid login credentials/i.test(r.error.message || "")){
            setErr(form, "current", "현재 비밀번호가 맞지 않아요."); shake(activeView()); form.current.focus(); return;
          }
          throw r.error;
        }
        try { tmp.auth.signOut({ scope: "local" }); } catch (e) {}
        form.current.value = "";
        openProfileEdit();
      });
    }).catch(function(err){
      note(form, mapError(err), "err"); shake(activeView());
    }).then(function(){ busy(form, false); });
  }
  function doProfile(form){
    var nick = form.nickname.value.trim(), pw = form.password.value;
    if (!configured || !currentUser) return;
    var nickChanged = !(currentProfile && nick === currentProfile.nickname);
    if (!nickChanged && !pw){ show("account"); return; }
    var uid = currentUser.id;
    busy(form, true);
    var taken = function(){ setErr(form, "nickname", "이미 사용 중인 닉네임이에요."); shake(activeView()); form.nickname.focus(); return false; };
    var saveNick = function(c){
      if (!nickChanged) return Promise.resolve(true);
      /* 내 것을 뺀 다른 사람이 같은 이름(대소문자 무시)을 쓰는지 */
      return c.from("profiles").select("id").ilike("nickname", nick.replace(/[\\%_]/g, "\\$&")).neq("id", uid).limit(1)
        .then(function(r){
          if (r.error) throw r.error;
          if (r.data && r.data.length) return taken();
          return c.from("profiles").update({ nickname: nick }).eq("id", uid).select("nickname, role").single()
            .then(function(u){
              if (u.error){
                if (u.error.code === "23505") return taken();
                throw u.error;
              }
              if (currentUser && currentUser.id === uid){
                currentProfile = Object.assign({}, currentProfile || {}, u.data);
                renderIdentity();
                notifyChange();
              }
              return true;
            });
        });
    };
    var done = false;
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return saveNick(c).then(function(ok){
        if (!ok) return;
        done = true;
        if (!pw) return;
        return c.auth.updateUser({ password: pw }).then(function(r){ if (r.error) throw r.error; });
      }).then(function(){
        if (!done) return;
        form.password.value = "";
        show("account");
        toast(pw && nickChanged ? "닉네임과 비밀번호를 바꿨어요." : pw ? "비밀번호를 바꿨어요." : "닉네임을 ‘" + nick + "’(으)로 바꿨어요.");
      });
    }).catch(function(err){
      var msg = mapError(err);
      /* 닉네임은 이미 저장된 뒤에 비밀번호만 실패한 경우를 알려준다 */
      if (done && nickChanged) msg = "닉네임은 바꿨지만 비밀번호는 못 바꿨어요. " + msg;
      note(form, msg, "err"); shake(activeView());
    }).then(function(){ busy(form, false); });
  }

  function doForgot(form){
    var email = form.email.value.trim();
    if (!configured) return devNote(form);
    busy(form, true);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return c.auth.resetPasswordForEmail(email, { redirectTo: redirectBase() });
    }).then(function(r){
      if (r.error) throw r.error;
      showSent("reset", "재설정 메일을 보냈어요", email, "메일 속 링크를 누르면 새 비밀번호를 정할 수 있어요.");
    }).catch(function(err){
      note(form, mapError(err), "err"); shake(activeView());
    }).then(function(){ busy(form, false); });
  }

  function doReset(form){
    var pw = form.password.value;
    if (!configured) return devNote(form);
    busy(form, true);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return c.auth.updateUser({ password: pw });
    }).then(function(r){
      if (r.error) throw r.error;
      form.reset();
      show("account");
    }).catch(function(err){
      note(form, mapError(err), "err"); shake(activeView());
    }).then(function(){ busy(form, false); });
  }

  var toastEl = null, toastTimer = null;
  function toast(msg){
    if (!toastEl){
      toastEl = document.createElement("div");
      toastEl.className = "oh-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 4200);
  }
  function startCooldown(b, secs){
    if (!b) return;
    clearInterval(b._cd);
    var label = b.getAttribute("data-label") || b.textContent;
    var left = secs;
    b.disabled = true;
    b.textContent = label + " (" + left + "초)";
    b._cd = setInterval(function(){
      left--;
      if (left <= 0){ clearInterval(b._cd); b.disabled = false; b.textContent = label; }
      else b.textContent = label + " (" + left + "초)";
    }, 1000);
  }
  function stopCooldown(b){
    if (!b) return;
    clearInterval(b._cd);
    b.disabled = false;
    b.textContent = b.getAttribute("data-label") || b.textContent;
  }
  function resendMail(kind, email, btnEl){
    if (!configured || !email) return;
    if (btnEl && btnEl.disabled) return;
    startCooldown(btnEl, 60);
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      return kind === "reset"
        ? c.auth.resetPasswordForEmail(email, { redirectTo: redirectBase() })
        : c.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: redirectBase(true) } });
    }).then(function(r){
      if (r.error) throw r.error;
      toast("메일을 다시 보냈어요. 받은 편지함을 확인해 주세요.");
    }).catch(function(err){
      stopCooldown(btnEl);
      toast(mapError(err));
    });
  }
  var sentCtx = { kind: "signup", email: "" };
  function showSent(kind, title, email, text){
    var v = vp.querySelector('[data-view="sent"]');
    sentCtx = { kind: kind, email: email };
    v.querySelector("[data-sent-back]").setAttribute("data-go", kind === "reset" ? "forgot" : "signup");
    startCooldown(v.querySelector(".oh-resend"), 60); /* 방금 보냈으니 바로 다시 보내지 못하게 */
    v.querySelector("[data-sent-title]").textContent = title;
    v.querySelector("[data-sent-text]").textContent = email + "\n" + text + "\n보낸 사람: 오늘의하우징 (todayhousing.capstone@gmail.com)\n메일이 안 보이면 스팸함을 확인하고, 찾으면 ‘스팸 아님’을 눌러 주세요.";
    v.querySelector("[data-sent-text]").style.whiteSpace = "pre-line";
    show("sent");
  }

  /* 구글 로그인은 작은 팝업 창에서 진행한다 — 지금 보던 페이지(도면 편집 중인 3D 화면 등)가 새로고침되며 날아가지 않게.
     팝업이 막혀 있으면 그냥 이 창에서 이동하는 방식으로 대신한다. 팝업 안에서 로그인이 끝나면 스스로 닫히고, 이 창은 로그인된 상태로 바뀐다. */
  var googleWatch = null;
  function doGoogle(){
    var form = activeView().querySelector("form");
    if (!configured){ if (form) devNote(form); return; }
    var pop = null;
    try {
      var w = 480, h = 640;
      pop = window.open("", "oh-google", "width=" + w + ",height=" + h + ",left=" + Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2)) + ",top=" + Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2)));
      if (pop && pop.document) pop.document.body.innerHTML = '<p style="font:15px sans-serif;padding:28px;color:#555">Google로 이동하는 중…</p>';
    } catch (e) { pop = null; }
    ready.then(function(c){
      if (!c) throw new Error("failed to fetch");
      var to = new URL(redirectBase());
      if (pop) to.searchParams.set("oh-popup", "1");
      return c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: to.toString(), skipBrowserRedirect: !!pop } });
    }).then(function(r){
      if (r && r.error) throw r.error;
      if (!pop) return;
      pop.location.href = r.data.url;
      clearInterval(googleWatch);
      var tries = 0;
      googleWatch = setInterval(function(){
        tries++;
        if (!sb || tries > 180){ clearInterval(googleWatch); return; }   /* 최대 3분 */
        sb.auth.getSession().then(function(x){
          var u = memberOnly((x && x.data && x.data.session && x.data.session.user) || null);
          if (u && (!currentUser || currentUser.id !== u.id)){
            clearInterval(googleWatch);
            rawUser = u; applyUser(u);
            try { if (!pop.closed) pop.close(); } catch (e) {}
          }
        });
      }, 1000);
    }).catch(function(err){
      try { if (pop) pop.close(); } catch (e) {}
      if (form){ note(form, mapError(err), "err"); shake(activeView()); }
    });
  }

  function doLogout(){
    if (!configured || !sb){ applyUser(null); return; }
    sb.auth.signOut().then(function(){ applyUser(null); });
  }

  var HANDLERS = { login: doLogin, signup: doSignup, forgot: doForgot, reset: doReset, profile: doProfile, verify: doVerify };

  /* ===== 구글 등 소셜 로그인 첫 방문: 닉네임 정하고 약관 동의 ===== */
  function needsWelcome(u){
    if (!u || u.is_anonymous) return false;
    var p = u.app_metadata && u.app_metadata.provider;
    if (!p || p === "email") return false;                 /* 이메일 가입자는 가입할 때 이미 동의함 */
    return !(u.user_metadata && u.user_metadata.terms_agreed_at);
  }
  var welcomeEl = null;
  function buildWelcome(){
    var m = document.createElement("div");
    m.className = "oh-modal oh-welcome";
    m.style.zIndex = "990";                                 /* 약관 전문 창(1000)이 위로 뜨게 */
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("aria-labelledby", "ohWelcomeTitle");
    m.innerHTML =
      '<div class="oh-modal-card" style="width:min(430px,100%)">' +
        '<div class="oh-modal-head"><h3 class="oh-modal-title" id="ohWelcomeTitle">환영해요! 닉네임을 정해 주세요</h3></div>' +
        '<form novalidate data-form="welcome" class="oh-modal-body" style="padding-top:10px"><p class="oh-note" role="status"></p>' +
          '<p class="oh-auth-sub" style="margin:0 0 14px">갤러리와 댓글에 이 닉네임이 보여요. Google 이름은 공개되지 않아요.</p>' +
          field("nickname", "닉네임", "text", "nickname", "2~12자, 한글·영문·숫자", { attrs: 'maxlength="12"' }) +
          '<div class="oh-f oh-terms" data-f="terms"><div class="oh-terms-row"><label class="oh-check"><input type="checkbox" name="terms"><span>서비스 이용과 개인정보 수집에 동의해요 (필수)</span></label><button type="button" class="oh-terms-open" data-act="terms">전문 보기</button></div><em class="oh-err" role="alert"></em></div>' +
          submitBtn("동의하고 시작") +
          '<div class="login-links" style="margin-top:12px"><a href="#" data-act="welcome-cancel">취소하고 로그아웃</a></div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);
    var form = m.querySelector("form");

    form.addEventListener("submit", function(e){
      e.preventDefault();
      var bad = checkAll(form);
      if (bad){ var el = fieldBox(form, bad).querySelector("input"); if (el) el.focus(); shake(m.querySelector(".oh-modal-card")); return; }
      doWelcome(form);
    });
    form.addEventListener("input", function(e){
      var box = e.target.closest && e.target.closest("[data-f]");
      if (box && box.classList.contains("has-err")) checkField(form, box.getAttribute("data-f"));
    });
    form.addEventListener("change", function(e){
      if (e.target.name === "terms") checkField(form, "terms");
    });
    form.addEventListener("focusout", function(e){
      if (e.target.name !== "nickname" || checkField(form, "nickname")) return;
      var typed = e.target.value.trim();
      nicknameTaken(typed).then(function(t){
        if (t && e.target.value.trim() === typed) setErr(form, "nickname", "이미 사용 중인 닉네임이에요.");
      });
    });
    m.addEventListener("click", function(e){
      var a = e.target.closest("[data-act]");
      if (!a) return;
      e.preventDefault();
      var act = a.getAttribute("data-act");
      if (act === "terms"){ termsTargetForm = form; openTerms(); }
      else if (act === "welcome-cancel") cancelWelcome();
    });
    m.addEventListener("keydown", function(e){
      if (e.key === "Escape"){ e.stopPropagation(); }       /* 닫기 대신 아무 일도 안 함 — 취소는 아래 링크로 */
    });
    welcomeEl = m;
  }
  function openWelcome(){
    if (IS_POPUP) return;                                    /* 구글 팝업 창에서는 띄우지 않음 (곧 닫힘) */
    if (!welcomeEl) buildWelcome();
    if (welcomeEl.classList.contains("open")) return;
    dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(function(){
      welcomeEl.classList.add("open");
      var i = welcomeEl.querySelector('input[name="nickname"]'); if (i) i.focus({ preventScroll: true });
    });
  }
  function closeWelcome(){
    if (!welcomeEl) return;
    welcomeEl.classList.remove("open");
    document.documentElement.style.overflow = "";
  }
  function cancelWelcome(){
    closeWelcome();
    toast("가입을 취소하고 로그아웃했어요.");
    doLogout();
  }
  function doWelcome(form){
    var nick = form.nickname.value.trim();
    if (!currentUser) return;
    var uid = currentUser.id;
    busy(form, true);
    var c = sb;
    c.from("profiles").select("id").ilike("nickname", nick.replace(/[\\%_]/g, "\\$&")).neq("id", uid).limit(1)
      .then(function(r){
        if (r.error) throw r.error;
        if (r.data && r.data.length){ setErr(form, "nickname", "이미 사용 중인 닉네임이에요."); shake(form.closest(".oh-modal-card")); return false; }
        return c.from("profiles").update({ nickname: nick }).eq("id", uid).select("nickname, role").single().then(function(u){
          if (u.error){
            if (u.error.code === "23505"){ setErr(form, "nickname", "이미 사용 중인 닉네임이에요."); shake(form.closest(".oh-modal-card")); return false; }
            throw u.error;
          }
          if (currentUser && currentUser.id === uid){ currentProfile = Object.assign({}, currentProfile || {}, u.data); }
          return c.auth.updateUser({ data: { terms_agreed_at: new Date().toISOString(), nickname: nick } }).then(function(x){
            if (x.error) throw x.error;
            return true;
          });
        });
      })
      .then(function(ok){
        if (!ok) return;
        closeWelcome();
        form.reset();
        renderIdentity(); notifyChange();
        toast("환영해요, " + nick + "님!");
      })
      .catch(function(err){ note(form, mapError(err), "err"); shake(form.closest(".oh-modal-card")); })
      .then(function(){ busy(form, false); });
  }

  /* ===== 약관 전문 팝업 ===== */
  var TERMS_HTML =
    '<p class="oh-meta">시행일: 2026년 10월 12일</p>' +
    '<h4>제1조 (목적)</h4>' +
    '<p>이 약관은 \'오늘의 하우징\'(이하 "서비스")이 제공하는 도면 기반 3D 가구 배치와 갤러리 게시·의견 교환 기능의 이용 조건, 절차, 이용자와 운영자의 권리와 의무를 정하는 것을 목적으로 합니다.</p>' +
    '<h4>제2조 (서비스 내용)</h4>' +
    '<ol><li>부동산 사이트 등에서 얻은 평면도 이미지를 불러와 벽을 직접 따라 그려 3D로 확인하는 기능</li>' +
    '<li>3D 공간에 가구를 배치해 보는 기능</li>' +
    '<li>배치 결과를 갤러리에 게시하고, 다른 이용자에게 의견(댓글)과 좋아요를 받는 기능</li>' +
    '<li>위 기능에 딸린 부가 기능</li></ol>' +
    '<p>이 서비스는 대학 캡스톤 디자인 프로젝트로 개발·운영되며, 기능은 사전 안내 후 변경되거나 중단될 수 있습니다.</p>' +
    '<h4>제3조 (회원가입과 계정 관리)</h4>' +
    '<ol><li>이용자는 이메일 또는 Google 계정으로 가입할 수 있으며, 만 14세 이상이어야 합니다.</li>' +
    '<li>계정과 비밀번호의 관리 책임은 이용자에게 있습니다. 다른 사람의 정보를 도용해 가입해서는 안 됩니다.</li>' +
    '<li>닉네임은 다른 이용자에게 보이며, 타인을 사칭하거나 불쾌감을 주는 닉네임은 변경을 요청할 수 있습니다.</li></ol>' +
    '<h4>제4조 (게시물과 저작권)</h4>' +
    '<ol><li>이용자가 올린 게시물(제목, 배치 결과, 썸네일, 댓글, 그리고 선택한 경우 도면·벽 이미지)의 저작권은 이용자에게 있습니다.</li>' +
    '<li>이용자는 서비스 안에서 게시물을 보여주고, 미리보기 이미지로 만들고, 검색·정렬하는 데 필요한 범위에서 운영자가 게시물을 무상으로 이용하도록 허락합니다.</li>' +
    '<li>부동산 사이트의 도면·사진 등 타인이 만든 자료를 올릴 때 생기는 권리 문제의 책임은 이용자에게 있습니다. 도면과 벽 이미지는 게시할 때 공개 여부를 직접 선택할 수 있습니다.</li></ol>' +
    '<h4>제5조 (금지 행위)</h4>' +
    '<ol><li>타인을 비방하거나 혐오·음란·불법 내용을 올리는 행위</li>' +
    '<li>집 주소, 연락처 등 본인 또는 타인의 개인정보를 게시물에 노출하는 행위</li>' +
    '<li>서비스를 자동화 수단으로 대량 수집하거나 정상 운영을 방해하는 행위</li>' +
    '<li>타인의 저작권 등 권리를 침해하는 행위</li></ol>' +
    '<p>운영자는 위 행위가 확인된 게시물을 숨기거나 삭제하고, 반복하는 이용자의 이용을 제한할 수 있습니다.</p>' +
    '<h4>제6조 (서비스 변경·중단과 책임 제한)</h4>' +
    '<ol><li>이 서비스는 무료로 제공되는 시범 서비스이며, 점검·오류·외부 서비스 장애 등으로 데이터가 사라지거나 일시 중단될 수 있습니다. 중요한 자료는 따로 보관해 주세요.</li>' +
    '<li>서비스가 보여주는 배치 결과나 제안은 참고용이며, 실제 가구 구매·시공·계약에 관한 판단과 책임은 이용자에게 있습니다.</li>' +
    '<li>운영자는 천재지변, 외부 서비스 장애 등 운영자가 통제할 수 없는 사유로 생긴 손해에 책임을 지지 않습니다.</li></ol>' +
    '<h4>제7조 (탈퇴와 이용 제한)</h4>' +
    '<p>이용자는 언제든지 탈퇴를 요청할 수 있습니다. 탈퇴하면 개인정보 안내에 따라 계정 정보가 삭제됩니다. 약관을 어긴 경우 운영자는 사전 안내 후 이용을 제한할 수 있습니다.</p>' +
    '<h4>제8조 (약관의 변경)</h4>' +
    '<p>약관을 바꿀 때에는 시행일 7일 전에 서비스 화면에 알립니다. 이용자에게 불리한 변경은 30일 전에 알립니다.</p>';

  var PRIVACY_HTML =
    '<p class="oh-meta">시행일: 2026년 10월 12일</p>' +
    '<h4>1. 수집하는 항목</h4>' +
    '<ul><li><b>가입할 때(필수):</b> 이메일 주소, 닉네임, 비밀번호(이메일로 가입하는 경우)</li>' +
    '<li><b>Google로 가입·로그인할 때:</b> Google이 제공하는 이메일 주소와 이름(프로필 정보). 비밀번호는 받지 않습니다.</li>' +
    '<li><b>서비스를 이용하면서 생기는 정보:</b> 게시물(제목, 가구 배치 데이터, 썸네일, 선택한 경우 도면·벽 이미지), 댓글, 좋아요, 로그인 시각 등 접속 기록</li>' +
    '<li><b>가입 없이(비회원으로) 글·의견·하트를 남길 때:</b> 입력한 닉네임과 접속 IP 주소. 화면에는 IP 앞 두 자리만 닉네임 옆에 표시되고, 전체 IP는 도배·중복 하트 방지에만 쓰이도록 암호화(해시)해서 저장합니다.</li></ul>' +
    '<h4>2. 수집·이용 목적</h4>' +
    '<ul><li>회원 식별과 로그인, 인증 메일·비밀번호 재설정 메일 발송</li>' +
    '<li>갤러리 게시, 댓글, 좋아요 등 서비스 기능 제공(닉네임이 다른 이용자에게 표시됩니다)</li>' +
    '<li>부정 이용 방지(도배 쿨타임, 같은 IP의 중복 하트 제한), 문의 대응, 서비스 개선</li>' +
    '<li>회원 관리: 운영자(관리자)는 회원 관리를 위해 이메일 주소와 닉네임을 열람하고 회원 구분(일반 회원·인테리어 업자·관리자)을 지정할 수 있습니다.</li></ul>' +
    '<h4>3. 보유·이용 기간</h4>' +
    '<p>회원 탈퇴 시까지 보관하며, 탈퇴하면 지체 없이 삭제합니다. 법령에 따라 보관해야 하는 정보는 그 기간 동안만 따로 보관합니다. 이용자가 직접 삭제한 게시물과 댓글은 바로 삭제됩니다. 도배 방지용 IP 기록은 1일 뒤 지워지고, 중복 하트 확인용 기록은 하트를 취소하거나 게시물이 삭제될 때 지워집니다.</p>' +
    '<h4>4. 저장·처리를 맡기는 곳</h4>' +
    '<p>서비스 운영을 위해 다음 외부 서비스를 이용하며, 이 과정에서 정보가 국외 서버에 저장될 수 있습니다.</p>' +
    '<ul><li><b>Supabase:</b> 회원 인증, 데이터베이스, 이미지 파일 저장</li>' +
    '<li><b>Vercel:</b> 웹사이트 호스팅</li>' +
    '<li><b>Google:</b> Google 계정으로 로그인하는 경우의 인증</li></ul>' +
    '<p>Google 로그인으로 받은 정보(이메일 주소, 이름)는 로그인과 계정 식별에만 쓰며, 광고나 제3자 제공에는 쓰지 않습니다. 오늘의 하우징의 Google API 정보 이용은 Google API 서비스 사용자 데이터 정책(제한적 사용 요건 포함)을 따릅니다.</p>' +
    '<h4>5. 비밀번호 보호</h4>' +
    '<p>비밀번호는 암호화(해시)되어 저장되며, 운영자도 원래 비밀번호를 볼 수 없습니다.</p>' +
    '<h4>6. 동의를 거부할 권리</h4>' +
    '<p>개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만 동의하지 않으면 회원가입과 게시, 댓글 기능을 이용할 수 없습니다. 둘러보기는 가입 없이 가능합니다.</p>' +
    '<h4>7. 이용자의 권리</h4>' +
    '<p>이용자는 언제든지 자신의 정보를 열람·정정·삭제하거나 탈퇴를 요청할 수 있습니다.</p>' +
    '<h4>8. 문의</h4>' +
    '<p>개인정보에 관한 문의는 운영자(오늘의 하우징 팀)에게 해 주세요. 문의 이메일: todayhousing.capstone@gmail.com</p>';

  var CLOSE_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var termsModal = null, termsReturnFocus = null, termsTargetForm = null;

  function buildTerms(){
    var m = document.createElement("div");
    m.className = "oh-modal";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-modal", "true");
    m.setAttribute("aria-labelledby", "ohTermsTitle");
    m.innerHTML =
      '<div class="oh-modal-card">' +
        '<div class="oh-modal-head"><h3 class="oh-modal-title" id="ohTermsTitle">약관과 개인정보 안내</h3>' +
          '<button type="button" class="oh-modal-x" data-m="close" aria-label="닫기">' + CLOSE_X + '</button></div>' +
        '<div class="oh-tabs" role="tablist">' +
          '<button type="button" class="oh-tab" role="tab" id="ohTabTerms" aria-controls="ohDocTerms" aria-selected="true" data-tab="terms">서비스 이용약관</button>' +
          '<button type="button" class="oh-tab" role="tab" id="ohTabPrivacy" aria-controls="ohDocPrivacy" aria-selected="false" data-tab="privacy">개인정보 수집·이용</button>' +
        '</div>' +
        '<div class="oh-modal-body">' +
          '<div class="oh-doc" id="ohDocTerms" role="tabpanel" aria-labelledby="ohTabTerms">' + TERMS_HTML + '</div>' +
          '<div class="oh-doc" id="ohDocPrivacy" role="tabpanel" aria-labelledby="ohTabPrivacy" hidden>' + PRIVACY_HTML + '</div>' +
        '</div>' +
        '<div class="oh-modal-foot">' +
          '<button type="button" class="oh-secondary" data-m="close">닫기</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-m="agree">동의하고 닫기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    m.addEventListener("click", function(e){
      e.stopPropagation(); /* 뒤쪽 로그인 창이 바깥 클릭으로 닫히지 않게 */
      if (e.target === m){ closeTerms(); return; }
      var tab = e.target.closest("[data-tab]");
      if (tab){ switchTermsTab(tab.getAttribute("data-tab")); return; }
      var act = e.target.closest("[data-m]");
      if (!act) return;
      if (act.getAttribute("data-m") === "agree"){
        var form = termsTargetForm || vp.querySelector('[data-form="signup"]');
        var cb = form && form.querySelector('input[name="terms"]');
        if (cb){ cb.checked = true; setErr(form, "terms", ""); }
      }
      closeTerms();
    });
    termsModal = m;
  }
  function switchTermsTab(name){
    termsModal.querySelectorAll(".oh-tab").forEach(function(t){
      t.setAttribute("aria-selected", t.getAttribute("data-tab") === name ? "true" : "false");
    });
    termsModal.querySelector("#ohDocTerms").hidden = name !== "terms";
    termsModal.querySelector("#ohDocPrivacy").hidden = name !== "privacy";
    termsModal.querySelector(".oh-modal-body").scrollTop = 0;
  }
  function termsKeydown(e){
    if (e.key === "Escape"){
      e.stopImmediatePropagation(); e.preventDefault(); /* 로그인 창까지 같이 닫히지 않게 */
      closeTerms();
      return;
    }
    if (e.key === "Tab"){
      var f = termsModal.querySelectorAll("button:not([hidden])");
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }
  function openTerms(){
    if (!termsModal) buildTerms();
    termsReturnFocus = document.activeElement;
    switchTermsTab("terms");
    document.documentElement.style.overflow = "hidden";
    /* 첫 렌더 후에 open 클래스를 붙여야 전환 애니메이션이 보인다 */
    requestAnimationFrame(function(){ termsModal.classList.add("open"); });
    document.addEventListener("keydown", termsKeydown, true);
    setTimeout(function(){ var b = termsModal.querySelector('[data-m="agree"]'); if (b) b.focus({ preventScroll: true }); }, 60);
  }
  function closeTerms(){
    if (!termsModal) return;
    termsModal.classList.remove("open");
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", termsKeydown, true);
    if (termsReturnFocus && termsReturnFocus.focus){ try { termsReturnFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ===== 이벤트 ===== */
  dd.addEventListener("click", function(e){
    /* 창 안에서 화면이 바뀌어 클릭한 요소가 사라져도 바깥 클릭으로 오인해 닫히지 않게 */
    e.stopPropagation();
    var go = e.target.closest("[data-go]");
    if (go){ e.preventDefault(); show(go.getAttribute("data-go")); return; }
    var eye = e.target.closest(".oh-eye");
    if (eye){
      e.preventDefault();
      var input = eye.parentNode.querySelector("input");
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      eye.innerHTML = showing ? EYE : EYE_OFF;
      eye.setAttribute("aria-pressed", showing ? "false" : "true");
      eye.setAttribute("aria-label", showing ? "비밀번호 보기" : "비밀번호 숨기기");
      return;
    }
    var act = e.target.closest("[data-act]");
    if (act){
      var a = act.getAttribute("data-act");
      if (a === "google") doGoogle();
      else if (a === "logout") doLogout();
      else if (a === "terms"){ termsTargetForm = null; openTerms(); }
      else if (a === "nick-edit") openProfile();
      else if (a === "resend-sent") resendMail(sentCtx.kind, sentCtx.email, act);
      else if (a === "resend-login") resendMail("signup", pendingEmail, act);
    }
  });

  dd.addEventListener("submit", function(e){
    var form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    note(form, "");
    var bad = checkAll(form);
    if (bad){
      shake(activeView());
      var el = fieldBox(form, bad).querySelector("input");
      if (el) el.focus();
      return;
    }
    HANDLERS[form.getAttribute("data-form")](form);
  });

  dd.addEventListener("input", function(e){
    var input = e.target;
    var form = input.closest && input.closest("form[data-form]");
    if (!form) return;
    var box = input.closest("[data-f]");
    if (box && box.classList.contains("has-err")) checkField(form, box.getAttribute("data-f"));
    if (input.name === "password" && form.querySelector(".oh-meter")){
      form.querySelector(".oh-meter").setAttribute("data-s", String(strength(input.value)));
    }
  });
  dd.addEventListener("focusout", function(e){
    var input = e.target;
    var form = input.closest && input.closest("form[data-form]");
    if (!form || input.type === "checkbox" || !input.name) return;
    if (!input.value) return; /* 아직 안 건드린 칸은 조용히 */
    /* 로그인 화면은 비밀번호 규칙 대신 "비어 있는지"만 본다 */
    var bad = checkField(form, input.name);
    /* 가입 중 닉네임은 칸을 벗어나는 순간 중복도 바로 알려준다 */
    if (!bad && input.name === "nickname" && form.getAttribute("data-form") === "signup"){
      var typed = input.value.trim();
      nicknameTaken(typed).then(function(t){
        if (t && input.value.trim() === typed) setErr(form, "nickname", "이미 사용 중인 닉네임이에요.");
      });
    }
  });
  dd.addEventListener("keydown", function(e){
    if (e.key === "Escape" && e.target.closest && e.target.closest("form[data-form=profile], form[data-form=verify]")){
      e.stopPropagation(); show("account");
    }
  });

  /* 창이 열릴 때 첫 칸에 포커스 (열고 닫는 건 각 페이지가 담당) */
  btn.addEventListener("click", function(){
    setTimeout(function(){
      if (dd.classList.contains("open")){ var v = activeView(); if (v) focusFirst(v); }
    }, 90);
  });
  /* 닫혔다가 다시 열 때는 로그인 화면(또는 계정 화면)부터 */
  new MutationObserver(function(){
    if (!dd.classList.contains("open")){
      setTimeout(function(){
        if (dd.classList.contains("open")) return;
        var target = currentUser ? "account" : "login";
        var v = activeView();
        if (v && v.getAttribute("data-view") !== target && v.getAttribute("data-view") !== "reset"){
          clearTimeout(swapTimer); clearTimeout(heightTimer);
          vp.style.height = "";
          v.classList.remove("is-active", "is-leaving");
          clearView(v);
          vp.querySelector('[data-view="' + target + '"]').classList.add("is-active");
        }
      }, 260);
    }
  }).observe(dd, { attributes: true, attributeFilter: ["class"] });

  /* ===== 로그인 창을 화면 한가운데 팝업으로 띄우기 =====
     게시 도중처럼 상단 로그인 버튼이 팝업·전체화면에 가려진 곳에서 쓴다. 페이지 이동이 없어서
     하던 작업(가구 배치 등)이 그대로 남는다. 로그인하면 true, 닫으면 false 로 이어진다. */
  var loginModal = null;
  function requestLogin(){
    if (currentUser) return Promise.resolve(true);
    if (loginModal) return loginModal.promise;
    var home = dd.parentNode, after = dd.nextSibling;
    var host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    var bd = document.createElement("div");
    bd.className = "oh-login-backdrop";
    var st = loginModal = {};
    st.promise = new Promise(function(res){ st.res = res; });
    var finished = false, waitTimer = null, closeObs = null;

    function finish(ok){
      if (finished) return;
      finished = true;
      clearTimeout(waitTimer);
      if (closeObs) closeObs.disconnect();
      document.removeEventListener("keydown", onKey, true);
      var i = listeners.indexOf(onAuth); if (i !== -1) listeners.splice(i, 1);
      dd.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      if (bd.parentNode) bd.parentNode.removeChild(bd);
      dd.classList.remove("oh-as-modal");
      if (home) home.insertBefore(dd, after && after.parentNode === home ? after : null);
      loginModal = null;
      st.res(!!ok);
    }
    function onAuth(){
      if (!currentUser) return;
      dd.classList.remove("open"); /* 바로 닫고, 프로필(닉네임)이 올 때까지 잠깐만 기다린다 */
      if (currentProfile) finish(true);
      else if (!waitTimer) waitTimer = setTimeout(function(){ finish(true); }, 2500);
    }
    function onKey(e){
      if (e.key === "Escape" && !document.querySelector(".oh-modal.open")){ e.stopPropagation(); dd.classList.remove("open"); }
    }
    listeners.push(onAuth);
    document.addEventListener("keydown", onKey, true);
    bd.addEventListener("click", function(){ dd.classList.remove("open"); });

    host.appendChild(bd);
    host.appendChild(dd);
    dd.classList.add("oh-as-modal");
    var v = activeView();
    if (v && v.getAttribute("data-view") !== "login"){ v.classList.remove("is-active", "is-leaving"); clearView(v); vp.querySelector('[data-view="login"]').classList.add("is-active"); vp.style.height = ""; }
    openDropdown();
    setTimeout(function(){ var a = activeView(); if (a) focusFirst(a); }, 120);
    /* 열린 뒤 닫히면(바깥 클릭·Esc·✕) 로그인 안 한 채로 끝난 것 */
    closeObs = new MutationObserver(function(){
      if (!dd.classList.contains("open") && !currentUser) finish(false);
      else if (!dd.classList.contains("open") && currentUser && !waitTimer) onAuth();
    });
    closeObs.observe(dd, { attributes: true, attributeFilter: ["class"] });
    return st.promise;
  }

  /* 다른 코드(게시/갤러리)가 로그인 상태를 읽을 수 있게 */
  window.OHAuth = {
    configured: configured,
    getUser: function(){ return currentUser; },
    getSessionUser: function(){ return rawUser; },
    ensureGuest: ensureGuest,
    getProfile: function(){ return currentProfile; },
    isAdmin: function(){ return !!(currentProfile && currentProfile.role === "admin"); },
    getRole: function(){ return (currentProfile && currentProfile.role) || "user"; },
    toast: toast,
    requestLogin: requestLogin,
    getNickname: function(){ return currentUser ? ((currentProfile && currentProfile.nickname) || nickOf(currentUser)) : ""; },
    getClient: function(){ return sb; },
    ready: function(){ return ready; },
    onChange: function(fn){ listeners.push(fn); }
  };
})();
