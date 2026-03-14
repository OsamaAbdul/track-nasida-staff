import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { Clock, MapPin, Camera, CheckCircle, LogOut as LogOutIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FaceCapture from "@/components/FaceCapture";
import * as faceapi from 'face-api.js';

export default function Attendance() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);

  const today = new Date();
  // Today's log
  const { data: office } = useQuery({
    queryKey: ["office-location"],
    queryFn: async () => {
      const { data } = await supabase.from("office_locations").select("*").eq('is_active', true).limit(1).maybeSingle();
      return data;
    }
  });

  const isWeekend = (office as any)?.working_days ? !(office as any).working_days.includes(today.getDay()) : (today.getDay() === 0 || today.getDay() === 6);
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();

  // Today's log
  const { data: todayLog, refetch: refetchToday } = useQuery({
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

  // Recent history
  const { data: history } = useQuery({
    queryKey: ["attendance-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("user_id", user!.id)
        .order("check_in_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    enabled: !!user,
  });

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      // Get location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;
      setCoords({ lat: latitude, lng: longitude });

      if (profile?.face_enrolled) {
        setShowFaceCapture(true);
        setLoading(false);
        return;
      }

      await completeCheckIn(latitude, longitude);
    } catch (err: any) {
      toast({
        title: "Check-in failed",
        description: err.message || "Could not get your location. Please enable GPS.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const completeCheckIn = async (latitude: number, longitude: number, score?: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('check_in_with_geofence', {
        p_latitude: latitude,
        p_longitude: longitude,
        p_face_match_score: score
      });

      if (error) throw error;

      if (!data.success) {
        const error: any = new Error(data.message);
        error.debug_distance_meters = data.debug_distance_meters;
        throw error;
      }

      toast({
        title: "Checked In!",
        description: `${data.message} Status: ${data.status} at ${format(new Date(), "hh:mm a")}`
      });
      refetchToday();
      setShowFaceCapture(false);
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (err: any) {
      const debugDist = err.debug_distance_meters;
      const displayDist = debugDist > 1000 ? `${(debugDist/1000).toFixed(2)}km` : `${debugDist}m`;
      toast({ 
        title: "Check-in failed", 
        description: `${err.message}${debugDist ? ` (Distance: ${displayDist}. GPS: ${coords?.lat.toFixed(6)}, ${coords?.lng.toFixed(6)})` : ''}`, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFaceVerify = async (descriptor: Float32Array) => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      // Fetch enrolled embedding
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('face_embedding')
        .eq('id', profile.id)
        .single();

      if (profileError || !profileData.face_embedding) throw new Error("Could not find enrolled face data.");

      const enrolledDescriptor = new Float32Array(profileData.face_embedding as number[]);
      const distance = faceapi.euclideanDistance(descriptor, enrolledDescriptor);
      const threshold = 0.45; // Stricter threshold (default 0.6)
      
      const score = Math.max(0, 1 - distance);

      if (distance < threshold) {
        if (coords) {
          await completeCheckIn(coords.lat, coords.lng, score);
        }
      } else {
        toast({
          title: "Face Verification Failed",
          description: "Faces do not match. Please try again the admin.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({ title: "Verification Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todayLog) return;
    setLoading(true);

    const { error } = await supabase
      .from("attendance_logs")
      .update({ check_out_at: new Date().toISOString() })
      .eq("id", todayLog.id);

    if (error) {
      toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Checked Out!", description: `At ${format(new Date(), "hh:mm a")}` });
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });
    }
    setLoading(false);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-success/10 text-success border-success/20";
      case "late": return "bg-warning/10 text-warning border-warning/20";
      case "absent": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">Attendance</h1>

      {/* Check-in/out card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/80 p-6 text-primary-foreground">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6" />
              <h2 className="text-lg font-bold font-display">
                {format(today, "EEEE, MMMM d, yyyy")}
              </h2>
            </div>
            <p className="text-3xl font-bold font-display">{format(today, "hh:mm a")}</p>
          </div>
          <CardContent className="p-6">
            {!todayLog ? (
              <div className="text-center space-y-4">
                {isWeekend ? (
                  <div className="py-8 space-y-3">
                    <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                      <Clock className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">Registration is closed today.</p>
                    <p className="text-xs text-muted-foreground/60 uppercase font-bold tracking-widest">Working Days: Mon - Fri</p>
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground">You haven't checked in today.</p>
                    <Button onClick={handleCheckIn} size="lg" disabled={loading} className="font-semibold">
                      {loading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent mr-2" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      Check In
                    </Button>
                    {showFaceCapture && (
                      <div className="mt-4 space-y-4">
                        <p className="text-sm font-medium">Please verify your face to complete check-in</p>
                        <FaceCapture mode="verify" onCapture={handleFaceVerify} />
                        <Button variant="ghost" size="sm" onClick={() => setShowFaceCapture(false)}>
                          Cancel Verification
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : !todayLog.check_out_at ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Checked in at {format(new Date(todayLog.check_in_at), "hh:mm a")}</span>
                </div>
                <Badge className={statusColor(todayLog.status)}>{todayLog.status}</Badge>
                <div>
                  <Button onClick={handleCheckOut} variant="secondary" size="lg" disabled={loading} className="font-semibold">
                    {loading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary-foreground border-t-transparent mr-2" />
                    ) : (
                      <LogOutIcon className="h-4 w-4 mr-2" />
                    )}
                    Check Out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span>
                    {format(new Date(todayLog.check_in_at), "hh:mm a")} — {format(new Date(todayLog.check_out_at), "hh:mm a")}
                  </span>
                </div>
                <Badge className={statusColor(todayLog.status)}>{todayLog.status}</Badge>
                <p className="text-sm text-muted-foreground">You're done for today!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Recent History</CardTitle>
          <CardDescription>Your last 30 attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {format(new Date(log.check_in_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{format(new Date(log.check_in_at), "hh:mm a")}</TableCell>
                    <TableCell>
                      {log.check_out_at ? format(new Date(log.check_out_at), "hh:mm a") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(log.status)}>
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No attendance records yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
