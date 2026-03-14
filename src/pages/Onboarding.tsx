
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  
  const [form, setForm] = useState({
    fullName: profile?.full_name || "",
    designation: "",
    department: "",
  });

  useEffect(() => {
    async function fetchDepartments() {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      if (data) setDepartments(data);
    }
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (profile?.onboarded) {
      navigate("/dashboard");
    }
  }, [profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.designation || !form.department) {
      toast({ title: "Missing fields", description: "Please fill in all details.", variant: "destructive" });
      return;
    }

    const nameParts = form.fullName.trim().split(" ");
    if (nameParts.length < 2) {
      toast({ 
        title: "Incomplete Name", 
        description: "Please provide both your First Name and Last Name.", 
        variant: "destructive" 
      });
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.fullName.trim(),
        designation: form.designation,
        department: form.department,
        onboarded: true,
      })
      .eq("user_id", user!.id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Welcome!", description: "Your profile has been set up." });
      await refreshProfile();
      navigate("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold font-display">Welcome to NASIDA</CardTitle>
            <CardDescription>Please complete your profile to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex justify-between">
                  Full Name
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Required</span>
                </Label>
                <Input 
                  id="fullName" 
                  value={form.fullName} 
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })} 
                  placeholder="e.g. John Doe"
                  className="border-primary/20 focus-visible:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground italic">Your name will be used on official attendance reports.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input 
                  id="designation" 
                  value={form.designation} 
                  onChange={(e) => setForm({ ...form, designation: e.target.value })} 
                  placeholder="Product Manager"
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select onValueChange={(val) => setForm({ ...form, department: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full font-semibold" disabled={loading}>
                {loading ? "Saving..." : "Complete Onboarding"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
