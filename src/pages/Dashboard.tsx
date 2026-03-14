import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, AlertTriangle, FileText, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { format, startOfDay, endOfDay } from "date-fns";
import FaceCapture from "@/components/FaceCapture";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user, profile, isAdmin, isHR, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);

  const today = new Date();
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  // Fetch today's attendance for current user
  const { data: todayLog } = useQuery({
    queryKey: ["today-attendance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("user_id", user!.id)
        .gte("check_in_at", todayStart)
        .lte("check_in_at", todayEnd)
        .order("check_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch pending disputes count
  const { data: pendingDisputes } = useQuery({
    queryKey: ["pending-disputes", user?.id, isHR, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!isHR && !isAdmin) {
        query = query.eq("user_id", user!.id);
      }
      const { count } = await query;
      return count ?? 0;
    },
    enabled: !!user,
  });

  // Fetch this month's attendance count
  const { data: monthCount } = useQuery({
    queryKey: ["month-attendance", user?.id],
    queryFn: async () => {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from("attendance_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .gte("check_in_at", monthStart);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const cards = [
    {
      title: "Today's Status",
      value: todayLog
        ? todayLog.check_out_at
          ? "Checked Out"
          : "Checked In"
        : "Not Checked In",
      icon: todayLog ? (
        <CheckCircle className="h-6 w-6 text-success" />
      ) : (
        <XCircle className="h-6 w-6 text-destructive" />
      ),
      color: todayLog ? "text-success" : "text-destructive",
    },
    {
      title: "Check-In Time",
      value: todayLog ? format(new Date(todayLog.check_in_at), "hh:mm a") : "—",
      icon: <Clock className="h-6 w-6 text-info" />,
      color: "text-info",
    },
    {
      title: "This Month",
      value: `${monthCount ?? 0} days`,
      icon: <CheckCircle className="h-6 w-6 text-primary" />,
      color: "text-primary",
    },
    {
      title: "Pending Disputes",
      value: String(pendingDisputes ?? 0),
      icon: <AlertTriangle className="h-6 w-6 text-warning" />,
      color: "text-warning",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">
            Good {today.getHours() < 12 ? "Morning" : today.getHours() < 17 ? "Afternoon" : "Evening"},{" "}
            {profile?.full_name || "Valued Staff Member"}!
          </h1>
          <p className="text-muted-foreground">{format(today, "EEEE, MMMM d, yyyy")}</p>
        </div>
        {!todayLog && (
          <Button onClick={() => navigate("/attendance")} size="lg" className="font-semibold">
            <Clock className="h-4 w-4 mr-2" /> Check In Now
          </Button>
        )}
        {todayLog && !todayLog.check_out_at && (
          <Button onClick={() => navigate("/attendance")} size="lg" variant="secondary" className="font-semibold">
            <Clock className="h-4 w-4 mr-2" /> Check Out
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                {card.icon}
              </CardHeader>
              <CardContent>
                <p className={cn("text-2xl font-bold", card.color)}>{card.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {(isAdmin || isHR) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate("/admin/staff")}>
              <Users className="h-4 w-4 mr-2" /> Manage Staff
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/attendance")}>
              <FileText className="h-4 w-4 mr-2" /> Attendance Reports
            </Button>
            <Button variant="outline" onClick={() => navigate("/disputes")}>
              <AlertTriangle className="h-4 w-4 mr-2" /> Review Disputes
            </Button>
          </CardContent>
        </Card>
      )}

      {profile && !profile.face_enrolled && (
        <Card className="border-warning bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Biometric Enrollment Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To use biometric attendance verification, you need to enroll your face features.
              This data is processed locally and only feature vectors are stored securely.
            </p>
            <Dialog open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
              <DialogTrigger asChild>
                <Button variant="warning">Enroll My Face</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Face Enrollment</DialogTitle>
                  <DialogDescription>
                    Position your face in the camera view to capture your biometric profile.
                  </DialogDescription>
                </DialogHeader>
                <FaceCapture
                  mode="enroll"
                  onCapture={async (descriptor) => {
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        face_embedding: Array.from(descriptor),
                        face_enrolled: true
                      })
                      .eq('user_id', user!.id);

                    if (error) {
                      toast({ title: "Enrollment failed", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: "Success", description: "Biometric profile updated." });
                      await refreshProfile();
                      setIsEnrollOpen(false);
                    }
                  }}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {(isAdmin || isHR) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Users className="h-5 w-5" />
              Admin shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button onClick={() => navigate("/admin/staff")} variant="outline" className="flex-1 min-w-[150px]">
              Manage Staff & Office
            </Button>
            <Button onClick={() => navigate("/admin/attendance")} variant="outline" className="flex-1 min-w-[150px]">
              Attendance Reports
            </Button>
            <Button onClick={() => navigate("/disputes")} variant="outline" className="flex-1 min-w-[150px]">
              Review Disputes
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
