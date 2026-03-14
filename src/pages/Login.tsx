import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn } from "lucide-react";
import nasidaLogo from "@/assets/nasida-logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      navigate("/dashboard");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registered Successfully!", description: "Now you can proceed to login." });
      setMode("login");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email sent", description: "Check your email for a password reset link." });
      setMode("login");
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-primary-foreground/20 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-primary-foreground/10 blur-3xl" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center px-12"
        >
          <img src={nasidaLogo} alt="NASIDA Logo" className="w-32 h-32 mx-auto mb-8 object-contain rounded-full" />
          <h1 className="text-4xl font-extrabold text-primary-foreground mb-4 font-display">
            NASIDA Attendance
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Nasarawa State Investment Development Agency — Staff Attendance & Management System
          </p>
        </motion.div>
      </div>

      {/* Right panel - form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex justify-center mb-8">
            <img src={nasidaLogo} alt="NASIDA Logo" className="w-20 h-20 object-contain" />
          </div>

          <Card className="border-0 shadow-xl bg-card">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold text-center font-display">
                {mode === "login" && "Welcome Back"}
                {mode === "signup" && "Create Account"}
                {mode === "forgot" && "Reset Password"}
              </CardTitle>
              <CardDescription className="text-center">
                {mode === "login" && "Sign in to access your attendance dashboard"}
                {mode === "signup" && "Register for the NASIDA attendance system"}
                {mode === "forgot" && "Enter your email to receive a reset link"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@nasida.ng"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11"
                    />
                  </div>

                  {mode !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                    {loading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <>
                        <LogIn className="h-4 w-4 mr-2" />
                        {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-6 text-center text-sm space-y-2">
                {mode === "login" && (
                  <>
                    <button onClick={() => setMode("forgot")} className="text-primary hover:underline block w-full">
                      Forgot your password?
                    </button>
                    <p className="text-muted-foreground">
                      Don't have an account?{" "}
                      <button onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">
                        Sign Up
                      </button>
                    </p>
                  </>
                )}
                {mode === "signup" && (
                  <p className="text-muted-foreground">
                    Already have an account?{" "}
                    <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium">
                      Sign In
                    </button>
                  </p>
                )}
                {mode === "forgot" && (
                  <button onClick={() => setMode("login")} className="text-primary hover:underline">
                    Back to Sign In
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
