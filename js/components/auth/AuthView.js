// js/components/auth/AuthView.js
import{registerWithEmail,loginWithEmail,loginWithGoogle,resetPassword}from"../../firebase/firebase-auth.js";

export class AuthView{
  constructor(options={}){
    this.onAuthenticated=options.onAuthenticated||(()=>{});
    this.mode="login";
    this.overlay=null;
    this.busy=false;
    this._ensureStyles();
  }

  open(mode="login"){
    this.mode=mode;
    if(!this.overlay)this._create();
    this._render();
    requestAnimationFrame(()=>this.overlay?.classList.add("is-open"));
    document.body.classList.add("auth-modal-open");
  }

  close(){
    if(!this.overlay)return;
    this.overlay.classList.remove("is-open");
    document.body.classList.remove("auth-modal-open");
    window.setTimeout(()=>{
      if(this.overlay&&!this.overlay.classList.contains("is-open")){
        this.overlay.remove();
        this.overlay=null;
      }
    },180);
  }

  _create(){
    this.overlay=document.createElement("div");
    this.overlay.className="cinejoy-auth-overlay";
    this.overlay.innerHTML=`<div class="cinejoy-auth-modal" role="dialog" aria-modal="true" aria-label="CineJoy account"></div>`;
    document.body.appendChild(this.overlay);
    this.overlay.addEventListener("click",event=>{
      if(event.target===this.overlay) this.close();
      if(event.target.closest("[data-auth-close]"))this.close();
      if(event.target.closest("[data-auth-mode='login']"))this.open("login");
      if(event.target.closest("[data-auth-mode='register']"))this.open("register");
      if(event.target.closest("[data-auth-mode='forgot']"))this.open("forgot");
    });
  }

  _render(){
    const modal=this.overlay?.querySelector(".cinejoy-auth-modal");
    if(!modal)return;
    modal.innerHTML=this.mode==="register"?this._registerHTML():this.mode==="forgot"?this._forgotHTML():this._loginHTML();
    this._bind();
  }

  _loginHTML(){
    return `<button type="button" class="cinejoy-auth-close" data-auth-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      <div class="cinejoy-auth-brand"><div class="cinejoy-auth-logo">C</div><div><strong>CineJoy</strong><span>Welcome back</span></div></div>
      <h2>Sign in</h2><p class="cinejoy-auth-subtitle">Sign in to sync your CineJoy account across devices.</p>
      <form id="cinejoy-login-form" class="cinejoy-auth-form">
        <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <label>Password<input id="auth-password" type="password" autocomplete="current-password" required placeholder="Password"></label>
        <button class="cinejoy-auth-primary" type="submit">Sign in</button>
      </form>
      <button type="button" class="cinejoy-auth-google" id="auth-google"><i class="fa-brands fa-google"></i> Continue with Google</button>
      <button type="button" class="cinejoy-auth-link" data-auth-mode="forgot">Forgot password?</button>
      <p class="cinejoy-auth-switch">Don't have an account? <button type="button" data-auth-mode="register">Create one</button></p>
      <div class="cinejoy-auth-message" id="auth-message"></div>`;
  }

  _registerHTML(){
    return `<button type="button" class="cinejoy-auth-close" data-auth-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      <div class="cinejoy-auth-brand"><div class="cinejoy-auth-logo">C</div><div><strong>CineJoy</strong><span>Create your account</span></div></div>
      <h2>Create account</h2><p class="cinejoy-auth-subtitle">Your profile will be synced with CineJoy.</p>
      <form id="cinejoy-register-form" class="cinejoy-auth-form">
        <label>Name<input id="auth-name" type="text" autocomplete="name" required placeholder="Your name"></label>
        <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <label>Password<input id="auth-password" type="password" autocomplete="new-password" minlength="6" required placeholder="At least 6 characters"></label>
        <button class="cinejoy-auth-primary" type="submit">Create account</button>
      </form>
      <button type="button" class="cinejoy-auth-google" id="auth-google"><i class="fa-brands fa-google"></i> Continue with Google</button>
      <p class="cinejoy-auth-switch">Already have an account? <button type="button" data-auth-mode="login">Sign in</button></p>
      <div class="cinejoy-auth-message" id="auth-message"></div>`;
  }

  _forgotHTML(){
    return `<button type="button" class="cinejoy-auth-close" data-auth-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      <div class="cinejoy-auth-brand"><div class="cinejoy-auth-logo">C</div><div><strong>CineJoy</strong><span>Password recovery</span></div></div>
      <h2>Reset password</h2><p class="cinejoy-auth-subtitle">We'll send a reset link to your email.</p>
      <form id="cinejoy-forgot-form" class="cinejoy-auth-form">
        <label>Email<input id="auth-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <button class="cinejoy-auth-primary" type="submit">Send reset link</button>
      </form>
      <p class="cinejoy-auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p>
      <div class="cinejoy-auth-message" id="auth-message"></div>`;
  }

  _bind(){
    this.overlay?.querySelector("#cinejoy-login-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const email=this.overlay.querySelector("#auth-email")?.value.trim();
      const password=this.overlay.querySelector("#auth-password")?.value;
      await this._run(async()=>{
        const user=await loginWithEmail(email,password);
        this.onAuthenticated(user);
        this.close();
      });
    });

    this.overlay?.querySelector("#cinejoy-register-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const name=this.overlay.querySelector("#auth-name")?.value.trim();
      const email=this.overlay.querySelector("#auth-email")?.value.trim();
      const password=this.overlay.querySelector("#auth-password")?.value;
      await this._run(async()=>{
        const user=await registerWithEmail(email,password,name);
        this.onAuthenticated(user);
        this.close();
      });
    });

    this.overlay?.querySelector("#auth-google")?.addEventListener("click",async()=>{
      await this._run(async()=>{
        const user=await loginWithGoogle();
        this.onAuthenticated(user);
        this.close();
      });
    });

    this.overlay?.querySelector("#cinejoy-forgot-form")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const email=this.overlay.querySelector("#auth-email")?.value.trim();
      await this._run(async()=>{
        await resetPassword(email);
        this._message("Password reset email sent.",false);
      });
    });
  }

  async _run(task){
    if(this.busy)return;
    this.busy=true;
    this._message("Please wait…",false);
    try{await task();}
    catch(error){
      console.error("[AuthView] Authentication error:",error);
      this._message(this._error(error),true);
    }finally{this.busy=false}
  }

  _message(text,error=false){
    const el=this.overlay?.querySelector("#auth-message");
    if(!el)return;
    el.textContent=text;
    el.className=`cinejoy-auth-message${error?" is-error":" is-success"}`;
  }

  _error(error){
    const code=error?.code||"";
    const map={
      "auth/invalid-email":"Please enter a valid email address.",
      "auth/user-not-found":"No account was found with this email.",
      "auth/wrong-password":"The email or password is incorrect.",
      "auth/invalid-credential":"The email or password is incorrect.",
      "auth/email-already-in-use":"An account already exists with this email.",
      "auth/weak-password":"Password must contain at least 6 characters.",
      "auth/popup-closed-by-user":"The Google sign-in window was closed.",
      "auth/popup-blocked":"Your browser blocked the Google sign-in window.",
      "auth/network-request-failed":"Network error. Please check your connection.",
      "auth/operation-not-allowed":"This sign-in method is not enabled in Firebase Authentication.",
      "auth/unauthorized-domain":"This local domain is not authorized in Firebase Authentication.",
      "auth/too-many-requests":"Too many attempts. Please wait and try again."
    };
    return map[code]||error?.message||"Authentication failed. Please try again.";
  }

  _ensureStyles(){
    if(document.getElementById("cinejoy-auth-styles"))return;
    const style=document.createElement("style");
    style.id="cinejoy-auth-styles";
    style.textContent=`
.cinejoy-auth-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(4,6,10,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;pointer-events:none;transition:opacity .2s ease}
.cinejoy-auth-overlay.is-open{opacity:1;pointer-events:auto}
.cinejoy-auth-modal{position:relative;width:min(430px,100%);max-height:min(720px,calc(100vh - 36px));overflow:auto;padding:32px;background:linear-gradient(180deg,#15181e 0%,#0e1014 100%);border:1px solid rgba(255,255,255,.1);border-radius:18px;color:#f5f7fa;box-shadow:0 30px 90px rgba(0,0,0,.58);transform:translateY(10px) scale(.985);transition:transform .2s ease}
.cinejoy-auth-overlay.is-open .cinejoy-auth-modal{transform:translateY(0) scale(1)}
.cinejoy-auth-close{position:absolute;top:14px;right:14px;width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#171a20;color:#8993a2;cursor:pointer}
.cinejoy-auth-close:hover{color:#fff;background:#20242c}
.cinejoy-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.cinejoy-auth-logo{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#fff;color:#0b0f15;font-size:20px;font-weight:900}
.cinejoy-auth-brand strong,.cinejoy-auth-brand span{display:block}
.cinejoy-auth-brand strong{font-size:15px;letter-spacing:.01em}.cinejoy-auth-brand span{margin-top:3px;color:#7d8796;font-size:11px}
.cinejoy-auth-modal h2{margin:0;color:#fff;font-size:25px;letter-spacing:-.02em}
.cinejoy-auth-subtitle{margin:7px 0 22px;color:#7f8998;font-size:12px;line-height:1.55}
.cinejoy-auth-form{display:grid;gap:14px}.cinejoy-auth-form label{display:grid;gap:7px;color:#aab2bf;font-size:11px;font-weight:600}
.cinejoy-auth-form input{width:100%;height:44px;box-sizing:border-box;padding:0 13px;border:1px solid #292e37;border-radius:9px;background:#0a0d12;color:#fff;outline:none;font:inherit;font-size:13px}
.cinejoy-auth-form input:focus{border-color:rgba(255,255,255,.55);box-shadow:0 0 0 3px rgba(255,255,255,.07)}
.cinejoy-auth-primary,.cinejoy-auth-google{width:100%;height:44px;border-radius:9px;cursor:pointer;font:inherit;font-size:12px;font-weight:800}
.cinejoy-auth-primary{margin-top:2px;border:0;background:#fff;color:#0b0f15}.cinejoy-auth-primary:hover{background:#e5e7eb}
.cinejoy-auth-google{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:10px;border:1px solid #dfe3e8;background:#fff;color:#111}
.cinejoy-auth-link,.cinejoy-auth-switch button{border:0;background:none;color:#fff;cursor:pointer;font:inherit}
.cinejoy-auth-link{display:block;margin:15px auto 0;font-size:11px}.cinejoy-auth-link:hover,.cinejoy-auth-switch button:hover{text-decoration:underline}
.cinejoy-auth-switch{margin:19px 0 0;text-align:center;color:#697382;font-size:11px}.cinejoy-auth-switch button{font-size:11px;font-weight:700}
.cinejoy-auth-message{min-height:18px;margin-top:14px;padding:0 4px;text-align:center;font-size:11px;line-height:1.45;color:#8a94a3}.cinejoy-auth-message.is-error{color:#ff9a9a}.cinejoy-auth-message.is-success{color:#b7f7c0}
@media(max-width:520px){.cinejoy-auth-overlay{padding:12px}.cinejoy-auth-modal{padding:25px 20px;border-radius:15px}.cinejoy-auth-modal h2{font-size:22px}}
`;
    document.head.appendChild(style);
  }
}

export default AuthView;
