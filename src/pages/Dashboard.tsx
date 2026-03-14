import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, AlertTriangle, FileText, Users, QrCode, Copy, Download, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { format, startOfDay, endOfDay } from "date-fns";
import FaceCapture from "@/components/FaceCapture";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

export default function Dashboard() {
  const { user, profile, isAdmin, isHR, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
   const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

   const today = new Date();

  const downloadAsImage = async () => {
    if (!qrRef.current) return;
    try {
      const dataUrl = await toPng(qrRef.current, { backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `nasida-qr-${profile?.full_name?.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Success", description: "QR Code downloaded as PNG." });
    } catch (err) {
      console.error("Download error:", err);
      toast({ title: "Error", description: "Failed to generate image.", variant: "destructive" });
    }
  };

  const downloadAsPDF = async () => {
    if (!qrRef.current) return;
    try {
      const dataUrl = await toPng(qrRef.current, { backgroundColor: '#ffffff' });
      const pdf = new jsPDF();
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.setFontSize(20);
      pdf.text("NASIDA ATTENDANCE ID", pdfWidth/2, 40, { align: 'center' });
      pdf.addImage(dataUrl, 'PNG', (pdfWidth - 100) / 2, 60, 100, 100);
      pdf.setFontSize(12);
      pdf.text(profile?.full_name || "Staff Member", pdfWidth/2, 170, { align: 'center' });
      pdf.text("Unique Attendance QR", pdfWidth/2, 180, { align: 'center' });
      
      pdf.save(`nasida-qr-${profile?.full_name?.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      toast({ title: "Success", description: "QR Code downloaded as PDF." });
    } catch (err) {
      console.error("PDF error:", err);
      toast({ title: "Error", description: "Failed to generate PDF.", variant: "destructive" });
    }
  };
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
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
        </div>

        {/* Sidebar / QR Section */}
        <div className="space-y-6">
          <Card className="border-2 border-primary/20 shadow-lg overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                <QrCode className="h-4 w-4" />
                My Attendance QR
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div ref={qrRef} className="p-4 bg-white rounded-2xl shadow-inner border">
                {(profile as any)?.qr_token ? (
                  <QRCode 
                    value={(profile as any).qr_token} 
                    size={160}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    viewBox={`0 0 256 256`}
                  />
                ) : (
                  <div className="h-[160px] w-[160px] bg-muted animate-pulse rounded-lg flex items-center justify-center text-[10px] text-muted-foreground uppercase font-bold">
                    Generating Token...
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm">Backup Check-in Code</h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed uppercase tracking-wider font-medium"> 
                  Use this QR if face recognition fails. <br/> Works only within office geofence.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-[10px] font-bold h-8"
                  onClick={() => {
                    if ((profile as any)?.qr_token) {
                      navigator.clipboard.writeText((profile as any).qr_token);
                      toast({ title: "Token Copied", description: "Your unique ID has been copied." });
                    }
                  }}
                >
                  <Copy className="h-3 w-3 mr-2" /> Copy ID
                </Button>
                <div className="flex gap-2 w-full">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 text-[9px] font-black h-8 bg-primary/5 hover:bg-primary/10 border-primary/20"
                    onClick={downloadAsImage}
                  >
                    <ImageIcon className="h-3 w-3 mr-1" /> PNG
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 text-[9px] font-black h-8 bg-primary/5 hover:bg-primary/10 border-primary/20"
                    onClick={downloadAsPDF}
                  >
                    <FileText className="h-3 w-3 mr-1" /> PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {(isAdmin || isHR) && (
            <Card className="border-primary/10 bg-muted/30 border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" />
                  Security Protocol
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  QR tokens are rotated periodically or can be reset from the Admin portal for security.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
