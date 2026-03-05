import {
  getConfig,
  getFixedAdminEmail,
  isClientEmailAllowed,
  supabase,
} from "./supabase-client.js";

const els = {
  loginSection: document.querySelector("[data-login-section]"),
  appSection: document.querySelector("[data-app-section]"),
  loginForm: document.querySelector("[data-login-form]"),
  loginButtonLabel: document.querySelector("[data-login-button-label]"),
  loginHint: document.querySelector("[data-login-hint]"),
  authMessage: document.querySelector("[data-auth-message]"),
  userEmail: document.querySelector("[data-user-email]"),
  logoutButton: document.querySelector("[data-logout-button]"),
};

function setAuthMessage(message, type = "") {
  if (!els.authMessage) return;
  els.authMessage.className = `status ${type}`.trim();
  els.authMessage.textContent = message;
}

function renderSession(session) {
  const email = session?.user?.email || "";

  if (els.userEmail) {
    els.userEmail.textContent = email || "로그인 필요";
  }

  const signedIn = Boolean(session?.user);
  if (els.loginSection) els.loginSection.classList.toggle("hidden", signedIn);
  if (els.appSection) els.appSection.classList.toggle("hidden", !signedIn);

  if (!signedIn) {
    document.dispatchEvent(
      new CustomEvent("admin-auth-changed", { detail: { session: null } }),
    );
    return;
  }

  if (!isClientEmailAllowed(email)) {
    setAuthMessage("허용된 관리자 계정이 아닙니다.", "error");
    supabase.auth.signOut();
    return;
  }

  setAuthMessage("로그인됨", "ok");
  document.dispatchEvent(
    new CustomEvent("admin-auth-changed", { detail: { session } }),
  );
}

async function restoreSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAuthMessage(error.message, "error");
    return;
  }
  renderSession(data.session);
}

async function handleEmailOtpLogin(event) {
  event.preventDefault();

  const email = getFixedAdminEmail();

  if (!isClientEmailAllowed(email)) {
    setAuthMessage("허용된 관리자 이메일이 아닙니다.", "error");
    return;
  }

  if (els.loginButtonLabel) {
    els.loginButtonLabel.textContent = "전송 중...";
  }

  setAuthMessage("로그인 링크 전송 중...");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split("#")[0],
      shouldCreateUser: false,
    },
  });

  if (error) {
    setAuthMessage(error.message, "error");
    if (els.loginButtonLabel) els.loginButtonLabel.textContent = "매직링크 요청";
    return;
  }

  setAuthMessage("로그인 링크를 이메일로 보냈습니다. 메일에서 링크를 열어주세요.", "ok");
  if (els.loginButtonLabel) els.loginButtonLabel.textContent = "매직링크 재요청";
}

async function handleLogout() {
  await supabase.auth.signOut();
  setAuthMessage("로그아웃됨");
  if (els.loginButtonLabel) {
    els.loginButtonLabel.textContent = "매직링크 요청";
  }
}

function mountHint() {
  const cfg = getConfig();
  const email = getFixedAdminEmail();

  if (els.loginHint) {
    if (cfg.allowedEmailHint) {
      els.loginHint.textContent = `관리자 이메일로 로그인 링크를 받으세요. 예: ${cfg.allowedEmailHint}`;
    } else {
      els.loginHint.textContent = `관리자 이메일(${email})로 로그인 링크를 받으세요.`;
    }
  }
}

function wireEvents() {
  if (els.loginForm) {
    els.loginForm.addEventListener("submit", handleEmailOtpLogin);
  }

  if (els.logoutButton) {
    els.logoutButton.addEventListener("click", handleLogout);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    renderSession(session);
  });
}

mountHint();
wireEvents();
restoreSession();
