import { useState, useEffect } from "react";
import { Ic, Brand, cx, inputCls } from "./rap_kit";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Figma Make "AuthFlow" — markup unchanged; the simulated steps are replaced
// with the real Supabase email-code / OAuth sign-in and the backend's
// password-recovery endpoints.
const homeFor = (role?: string) => (role === "COMPANY" ? "codash" : role === "ADMIN" ? "admin" : "feed");

export function AuthFlow({ route, go }: { route: string; go: (r: string) => void }) {
 const { login } = useAuth();
 const [email,setEmail]=useState(""); const [name,setName]=useState(""); const [role,setRole]=useState("engineer");
 const [step,setStep]=useState("email"); const [code,setCode]=useState(""); const [error,setError]=useState(""); const [seconds,setSeconds]=useState(0); const [busy,setBusy]=useState(false);
 // Step/error/code reset per route via the key App puts on <AuthFlow>.
 useEffect(()=>{if(seconds<=0)return;const timer=setTimeout(()=>setSeconds(seconds-1),1000);return()=>clearTimeout(timer);},[seconds]);
 const join=route==="register"; const recovery=route==="forgot"; const reset=route==="reset";
 const msg=(e:unknown)=>(e as {message?:string})?.message||"";
 const requestCode=async()=>{const {error:otpError}=await supabase.auth.signInWithOtp({email:email.trim(),options:join?{shouldCreateUser:true,data:{full_name:name.trim()}}:{shouldCreateUser:false}});if(otpError)throw otpError;};
 const send=async()=>{if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setError("Enter a valid email address.");return;}if(join&&!name.trim()){setError("Enter your full name.");return;}setError("");setBusy(true);
  try{
   await requestCode();
   if(join)localStorage.setItem("pending_registration",JSON.stringify({email:email.trim(),fullName:name.trim(),role:role==="company"?"COMPANY":"ENGINEER"}));
   setStep("code");setSeconds(30);
  }catch(e){const m=msg(e).toLowerCase();setError(!join&&(m.includes("signups not allowed")||m.includes("user not found"))?"We couldn't find an account with that email. Check the address, or create an account.":msg(e)||extractErrorMessage(e,"Something went wrong. Please try again."));}
  finally{setBusy(false);}};
 const verify=async()=>{setBusy(true);setError("");
  try{const {data,error:verifyError}=await supabase.auth.verifyOtp({email:email.trim(),token:code,type:"email"});if(verifyError||!data.session)throw verifyError||new Error("Verification failed");
   let user=await fetchBackendUser(data.session);user=await applyPendingRegistration(data.session,user);login(data.session.access_token,user,data.session.refresh_token);
   go(join?(user.role==="COMPANY"?"coprofile":"onboarding"):homeFor(user.role));
  }catch(e){setError(/expired|invalid/i.test(msg(e))?"That code is invalid or has expired. Request a new code.":msg(e)||extractErrorMessage(e,"We couldn't verify that code. Please try again."));}
  finally{setBusy(false);}};
 const resend=async()=>{setError("");setCode("");try{await requestCode();setSeconds(30);}catch(e){setError(extractErrorMessage(e,"Couldn't resend the code. Please try again."));}};
 const oauth=async(p:string)=>{setError("");const provider=p==="Microsoft"?"azure":p==="GitHub"?"github":"google";await supabase.auth.signInWithOAuth({provider,options:{redirectTo:`${window.location.origin}/auth/callback`}});};

 const button="flex min-h-11 w-full items-center justify-center rounded-lg bg-[#0866FF] px-5 py-3 font-semibold text-white hover:bg-[#0756d8] disabled:opacity-50";
 return <div className="min-h-screen bg-[#F0F2F5] text-[#1c1e21]">
 <main className="mx-auto grid min-h-[calc(100vh-110px)] max-w-[1080px] items-center gap-16 px-6 py-12 lg:grid-cols-[1fr_420px]">
 <section><div className="flex items-center gap-3"><Brand s={52}/><span className="text-2xl font-bold text-[#0866FF]">Remote AI Platform</span></div><h1 className="mt-7 text-5xl">Your network.<br/>Your next opportunity.</h1><p className="mt-5 max-w-lg text-xl leading-8 text-slate-600">Meet professionals, find remote work, and bring great projects to life together.</p><div className="mt-8 space-y-5">{[["users","Connect with your community","Share your work and learn from other professionals."],["target","Find a role that fits","Understand the skills and experience behind every match."],["board","Go from opportunity to delivery","Manage contracts, milestones and project work in one place."]].map(([icon,title,copy])=><div key={title} className="flex items-start gap-4"><span className="rounded-full bg-white p-3 text-[#0866FF]"><Ic n={icon}/></span><div><b>{title}</b><p className="mt-1 text-sm text-slate-500">{copy}</p></div></div>)}</div></section>
 <section><div className="rounded-xl border border-slate-200 bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,.09)]">
 {reset?<><h2>Passwords are no longer used</h2><p className="mt-2 text-sm text-slate-500">Sign in with a one-time code sent to your email, or with Google, Microsoft or GitHub. Your account and profile are unchanged.</p><button type="button" className={button+" mt-6"} onClick={()=>go("login")}>Go to sign in</button></>:
 step==="code"?<><button onClick={()=>{setStep("email");setError("");}} className="text-sm text-[#0866FF]">← Change email</button><span className="mx-auto my-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#0866FF]"><Ic n="mail" s={26}/></span><h2>Check your email</h2><p className="mt-2 text-sm text-slate-500">Enter the code sent to <b className="text-slate-800">{email}</b>.</p><form onSubmit={e=>{e.preventDefault();if(code.length<6||code.length>12){setError("Enter the complete code from your email (6–12 characters).");return;}verify();}}><label className="mt-5 block">Sign-in code<input id="code" aria-label="Sign-in code" autoComplete="one-time-code" maxLength={12} value={code} onChange={e=>setCode(e.target.value.trim())} className={inputCls+" mt-2 !text-xl tracking-widest"}/></label><button className={button+" mt-5"} disabled={busy}>Verify and continue</button></form><button disabled={seconds>0} onClick={resend} className="mt-4 w-full text-sm font-semibold text-[#0866FF] disabled:text-slate-400">{seconds>0?"Resend code in "+seconds+"s":"Resend code"}</button></>:
 <><h2>{join?"Create your account":recovery?"Recover your account":"Welcome back"}</h2><p className="mt-2 text-sm text-slate-500">{join?"Find your community and your next opportunity.":recovery?"Enter the email you signed up with. We'll email you a one-time sign-in code, so you don't need a password. If you signed up with Google, Microsoft or GitHub, use that button on the sign-in page.":"Sign in with an email code. No password needed."}</p><form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();send();}}>{join&&<><div className="grid grid-cols-2 gap-3">{[["engineer","Find work","briefcase"],["company","Hire talent","building"]].map(([value,label,icon])=><button type="button" aria-pressed={role===value} key={value} onClick={()=>setRole(value)} className={cx("rounded-lg border-2 p-3 text-left",role===value?"border-[#0866FF] bg-blue-50":"border-slate-200")}><Ic n={icon}/><b className="mt-2 block">{label}</b></button>)}</div><label className="block">Full name<input aria-label="Full name" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className={inputCls+" mt-2"} placeholder="Your full name"/></label></>}<label className="block">Email address<input id="email" aria-label="Email address" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className={inputCls+" mt-2"}/></label><button className={button} disabled={busy}>{recovery?"Email me a sign-in code":join?"Email me a sign-up code":"Email me a sign-in code"}</button></form>{!recovery&&<><div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200"/>or continue with<span className="h-px flex-1 bg-slate-200"/></div><div className="grid grid-cols-3 gap-2">{["Google","Microsoft","GitHub"].map(p=><button key={p} onClick={()=>oauth(p)} className="rounded-lg border border-slate-300 py-3 text-sm font-semibold hover:bg-slate-50">{p}</button>)}</div><div className="mt-6 border-t border-slate-200 pt-5 text-center"><button onClick={()=>go(join?"login":"register")} className="font-semibold text-[#0866FF]">{join?"Already a member? Sign in":"New here? Create an account"}</button></div></>}<button className="mt-4 w-full text-sm text-slate-500" onClick={()=>go(recovery?"login":"forgot")}>{recovery?"Back to sign in":"Having trouble signing in?"}</button></>}
 {error&&<p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
 </div><div className="mt-5 flex justify-center gap-5 text-xs text-slate-500">{["terms","privacy","impressum"].map(p=><button key={p} onClick={()=>go(p)} className="capitalize hover:underline">{p}</button>)}</div><p className="mt-4 text-center text-xs text-slate-400">Remote AI Platform · 2026</p></section>
 </main></div>;
}
