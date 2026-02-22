"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", backgroundColor:"#07091a", padding:"24px" }}>
      <div style={{ width:"100%", maxWidth:"400px" }}>
        <div style={{ textAlign:"center", marginBottom:"32px" }}>
          <div style={{ width:"48px", height:"48px", borderRadius:"12px", background:"linear-gradient(135deg,#2d6cf5,#1a3fa8)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 style={{ fontFamily:"sans-serif", fontSize:"20px", fontWeight:600, color:"#e8edfb", margin:0 }}>Event Intelligence</h1>
          <p style={{ color:"#6278a8", fontSize:"14px", marginTop:"4px" }}>Global macro impact monitoring</p>
        </div>

        <div style={{ background:"#0d1230", border:"1px solid #1c2855", borderRadius:"16px", padding:"32px" }}>
          <h2 style={{ color:"#e8edfb", fontSize:"18px", fontWeight:600, marginBottom:"24px", fontFamily:"sans-serif" }}>Sign in</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:"16px" }}>
              <label style={{ display:"block", color:"#6278a8", fontSize:"13px", marginBottom:"6px" }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@company.com"
                style={{ width:"100%", background:"#080c20", border:"1px solid #1c2855", borderRadius:"8px", padding:"10px 12px", color:"#cdd8f6", fontSize:"14px", outline:"none", boxSizing:"border-box" }}
              />
            </div>
            <div style={{ marginBottom:"16px" }}>
              <label style={{ display:"block", color:"#6278a8", fontSize:"13px", marginBottom:"6px" }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                style={{ width:"100%", background:"#080c20", border:"1px solid #1c2855", borderRadius:"8px", padding:"10px 12px", color:"#cdd8f6", fontSize:"14px", outline:"none", boxSizing:"border-box" }}
              />
            </div>
            {error && (
              <div style={{ background:"rgba(240,77,77,0.1)", border:"1px solid rgba(240,77,77,0.3)", color:"#f87171", borderRadius:"8px", padding:"10px 12px", fontSize:"13px", marginBottom:"16px" }}>
                {error}
              </div>
            )}
            <button
              type="submit" disabled={loading}
              style={{ width:"100%", background:"linear-gradient(135deg,#2d6cf5,#1a4fd8)", color:"white", border:"none", borderRadius:"8px", padding:"11px", fontSize:"14px", fontWeight:600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p style={{ textAlign:"center", color:"#6278a8", fontSize:"13px", marginTop:"20px" }}>
            No account?{" "}
            <Link href="/register" style={{ color:"#3b7bfa" }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
