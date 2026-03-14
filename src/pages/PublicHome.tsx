import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import FaceCapture from "@/components/FaceCapture";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Clock,
  UserCheck,
  LogIn,
  ShieldCheck,
  MapPin,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  Scan
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Html5Qrcode } from "html5-qrcode";
import { db } from "@/lib/offline-db";
import { motion } from "framer-motion";

import { CheckCircle } from "lucide-react";

export default function PublicHome() {
  const [time, setTime] = useState(new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"face" | "qr">("face");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number, accuracy: number } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [checkInSuccess, setCheckInSuccess] = useState<{ name: string; message: string } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: office } = useQuery({
    queryKey: ["office-location"],
    queryFn: async () => {
      const { data } = await supabase.from("office_locations").select("*").eq('is_active', true).limit(1).maybeSingle();
      return data;
    }
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);

    // Get location early
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );

    // Sync cache if online
    const syncCache = async () => {
      if (navigator.onLine) {
        try {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, face_embedding").eq("face_enrolled", true);
          if (profiles) {
            await db.profiles.clear();
            await db.profiles.bulkAdd(profiles as any);
            console.log("Offline cache synced");
          }
        } catch (e) {
          console.error("Failed to sync cache", e);
        }
      }
    };
    syncCache();

    // Monitor connectivity
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync pending logs when online
  useEffect(() => {
    const syncPending = async () => {
      if (isOnline) {
        const pending = await db.attendance_logs.where("synced").equals(0).toArray();
        if (pending.length > 0) {
          console.log(`Syncing ${pending.length} pending logs...`);
          for (const log of pending) {
            try {
              const { data, error } = await supabase.rpc('identify_and_check_in', {
                p_descriptor: log.face_embedding as any, // We need to store descriptor in log too or just use the found user_id?
                // Actually, our RPC requires descriptor for the "Search" part. 
                // If we already identified them offline, should we have a "check_in_direct" RPC?
                // Let's stick to identify_and_check_in for consistency, but we need the descriptor.
                p_latitude: log.latitude,
                p_longitude: log.longitude
              });
              if (!error && data.success) {
                await db.attendance_logs.update(log.id!, { synced: true });
              }
            } catch (e) {
              console.error("Sync failed for log", log.id, e);
            }
          }
          toast({ title: "Sync Complete", description: `${pending.length} offline records pushed to server.` });
        }
      }
    };
    syncPending();
  }, [isOnline]);

  const isWeekend = (office as any)?.working_days ? !(office as any).working_days.includes(time.getDay()) : (time.getDay() === 0 || time.getDay() === 6);

  // Helper to calculate distance in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  const distanceMeters = coords && office?.latitude && office?.longitude
    ? calculateDistance(coords.lat, coords.lng, office.latitude, office.longitude)
    : null;

  const isInRange = distanceMeters !== null && office?.radius_meters
    ? distanceMeters <= (office.radius_meters + 15) // 15m buffer for indoor jitter
    : false;

  const refreshLocation = () => {
    setCoords(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        console.error("Geolocation error:", err);
        toast({
          title: "Location Error",
          description: "Could not retrieve your current location. Please check your GPS settings.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true }
    );
  };

  const handleQRScan = async (decodedText: string) => {
    setLoading(true);
    try {
      if (!coords) {
        throw new Error("Location access is required. Please enable GPS.");
      }

      const { data, error } = await (supabase.rpc as any)('check_in_with_qr', {
        p_qr_token: decodedText,
        p_latitude: coords.lat,
        p_longitude: coords.lng
      });

      if (error) throw error;

      if (data.success) {
        setCheckInSuccess({ name: data.full_name, message: data.message });
        setTimeout(() => {
          setCheckInSuccess(null);
          setIsOpen(false);
        }, 3000);
      } else {
        toast({
          title: "QR Check-in Failed",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Scan Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    const startScanner = async () => {
      if (isOpen && scanMode === "qr") {
        // Wait for unmount cleanup of FaceCapture to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        const container = document.getElementById("qr-reader");
        if (!container) return;

        html5QrCode = new Html5Qrcode("qr-reader");
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText) => {
              html5QrCode?.stop().then(() => {
                handleQRScan(decodedText);
              });
            },
            (errorMessage) => {
              // Ignore constant "no QR found" noise
            }
          );
        } catch (err) {
          console.error("Unable to start scanning", err);
        }
      }
    };

    startScanner();

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [isOpen, scanMode]);

  const handleFaceIdentify = async (descriptor: Float32Array) => {
    setLoading(true);
    try {
      if (!coords) {
        throw new Error("Location access is required for attendance. Please enable GPS.");
      }

      if (isOnline) {
        // Online: Use robust server-side RPC
        const { data, error } = await supabase.rpc('identify_and_check_in', {
          p_descriptor: Array.from(descriptor),
          p_latitude: coords.lat,
          p_longitude: coords.lng
        });

        if (error) throw error;

        if (data.success) {
          setCheckInSuccess({ name: data.full_name, message: data.message });
          setTimeout(() => {
            setCheckInSuccess(null);
            setIsOpen(false);
          }, 3000);
        } else {
          toast({
            title: "Check-in Failed",
            description: data.message,
            variant: "destructive",
          });
        }
      } else {
        // Offline: Local Euclidean search
        const profiles = await db.profiles.toArray();
        let bestMatch = null;
        let minDistance = 0.6; // Threshold matching our RPC logic (~0.6 score = ~0.4 dist)

        for (const profile of profiles) {
          const dist = Math.sqrt(
            profile.face_embedding.reduce((acc, val, i) => acc + Math.pow(val - descriptor[i], 2), 0)
          );
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = profile;
          }
        }

        if (bestMatch) {
          // Record locally
          await db.attendance_logs.add({
            user_id: bestMatch.user_id,
            full_name: bestMatch.full_name,
            check_in_at: new Date().toISOString(),
            latitude: coords.lat,
            longitude: coords.lng,
            status: new Date().getHours() < 9 ? 'present' : 'late',
            match_score: 1 - minDistance,
            synced: false,
            face_embedding: Array.from(descriptor) as any // Store to re-verify during sync if needed
          } as any);

          setCheckInSuccess({
            name: bestMatch.full_name,
            message: "Offline attendance recorded. Will sync when online."
          });

          setTimeout(() => {
            setCheckInSuccess(null);
            setIsOpen(false);
          }, 3000);
        } else {
          toast({
            title: "Offline Recognition Failed",
            description: "Face not recognized in local cache. Please sync once online.",
            variant: "destructive",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] aspect-square bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] aspect-square bg-primary/5 rounded-full blur-3xl animate-pulse delay-700" />

      <div className="max-w-4xl w-full z-10">
        {/* Header Section */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
            <ShieldCheck className="h-3 w-3" />
            Bionic Recognition Active
          </div>
          <h1 className="text-5xl md:text-7xl font-black font-display tracking-tight text-foreground italic">
            NASIDA <span className="text-primary not-italic">ATTEND</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Smart, secure, and instant attendance tracking for the modern workplace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Main Action Card */}
          <Card className="border-2 border-primary/20 shadow-premium group hover:border-primary/40 transition-all duration-500 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <UserCheck className="h-24 w-24" />
            </div>

            <CardContent className="p-8 flex flex-col h-full justify-between">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="h-5 w-5" />
                    <span className="font-bold tracking-widest uppercase text-sm">Real-time Clock</span>
                  </div>
                  <h2 className="text-6xl font-black font-mono tracking-tighter tabular-nums">
                    {format(time, "HH:mm:ss")}
                  </h2>
                  <p className="font-medium text-muted-foreground italic">
                    {format(time, "EEEE, MMMM do yyyy")}
                  </p>
                </div>

                {/* Geofence Diagnostic Panel */}
                <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-primary/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      <MapPin className="h-3 w-3 text-primary" />
                      Geofence Status
                    </div>
                    {distanceMeters !== null && (
                      <div className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border",
                        isInRange
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : "bg-red-500/10 text-red-500 border-red-500/20"
                      )}>
                        {isInRange ? "In Range" : "Out of Range"}
                      </div>
                    )}
                  </div>

                  {coords ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground/60">Current distance</p>
                        <p className="text-xl font-black font-mono">
                          {distanceMeters !== null ? (
                            distanceMeters < 1000
                              ? `${Math.round(distanceMeters)}m`
                              : `${(distanceMeters / 1000).toFixed(2)}km`
                          ) : '---'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground/60">Allowed Radius</p>
                        <p className="text-xl font-black font-mono text-primary/60">
                          {office?.radius_meters ? `${office.radius_meters}m` : '---'}
                        </p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-primary/5 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground/80">
                          <span>Lat: {coords.lat.toFixed(6)}</span>
                          <span>Lng: {coords.lng.toFixed(6)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-muted-foreground/60 uppercase">Signal Accuracy</span>
                          <span className={cn(
                            coords.accuracy < 20 ? "text-green-500" : coords.accuracy < 50 ? "text-warning" : "text-destructive"
                          )}>
                            ±{Math.round(coords.accuracy)}m
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={refreshLocation}
                          className="w-full mt-2 h-7 text-[10px] font-black uppercase tracking-widest border border-primary/10 hover:bg-primary/5"
                        >
                          <RefreshCw className="h-3 w-3 mr-2" />
                          Refresh Location
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 gap-2">
                      <RefreshCw className="h-5 w-5 animate-spin text-primary/40" />
                      <p className="text-xs font-bold text-muted-foreground animate-pulse uppercase tracking-widest">Detecting GPS Coordinates...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-12">
                {isWeekend ? (
                  <div className="w-full h-16 rounded-xl bg-muted/50 border border-dashed flex items-center justify-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground italic">Closed (Sat-Sun)</span>
                  </div>
                ) : (
                  <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                      <Button size="lg" className="w-full h-16 text-lg font-black uppercase tracking-widest gap-3 shadow-lg hover:shadow-primary/20 transition-all group">
                        Sign In Now
                        <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-card border-2">
                      <DialogHeader>
                        <div className="flex items-center justify-between">
                          <DialogTitle className="text-2xl font-black">
                            {checkInSuccess ? (
                              <span className="text-green-600">SUCCESS!</span>
                            ) : scanMode === "face" ? (
                              "Face Recognition"
                            ) : (
                              "QR Code Scanner"
                            )}
                          </DialogTitle>
                          {!checkInSuccess && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setScanMode(scanMode === "face" ? "qr" : "face")}
                              className="text-[10px] font-black uppercase tracking-widest text-primary border border-primary/10 hover:bg-primary/5"
                            >
                              {scanMode === "face" ? (
                                <><QrCode className="h-3 w-3 mr-2" /> Use QR Code</>
                              ) : (
                                <><Scan className="h-3 w-3 mr-2" /> Use Face Recognition</>
                              )}
                            </Button>
                          )}
                        </div>
                        {!checkInSuccess && (
                          <DialogDescription>
                            {scanMode === "face"
                              ? "Look directly into the camera for instant identification."
                              : "Position your staff QR code in front of the camera."}
                          </DialogDescription>
                        )}
                      </DialogHeader>
                      <div className="py-4">
                        {checkInSuccess ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center space-y-6 py-10 text-center"
                          >
                            <div className="relative">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", damping: 12, stiffness: 200 }}
                                className="h-24 w-24 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/20"
                              >
                                <CheckCircle className="h-12 w-12 text-white" />
                              </motion.div>
                              <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-green-500 rounded-full -z-10"
                              />
                            </div>
                            <div className="space-y-2">
                              <h3 className="text-3xl font-black tracking-tight text-foreground uppercase">
                                Welcome, <br /> {checkInSuccess.name}!
                              </h3>
                              <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">
                                {checkInSuccess.message}
                              </p>
                            </div>
                            <div className="w-full max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: "100%" }}
                                animate={{ width: "0%" }}
                                transition={{ duration: 3, ease: "linear" }}
                                className="h-full bg-green-500"
                              />
                            </div>
                          </motion.div>
                        ) : loading ? (
                          <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            <p className="font-bold text-primary animate-pulse uppercase tracking-widest">VERIFYING...</p>
                          </div>
                        ) : scanMode === "face" ? (
                          <FaceCapture onCapture={handleFaceIdentify} mode="verify" />
                        ) : (
                          <div id="qr-reader" className="w-full rounded-xl overflow-hidden border-2 border-primary/20" />
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Portal Links Card */}
          <div className="flex flex-col gap-4">
            <Card className="flex-1 border-primary/10 hover:border-primary/30 transition-all group cursor-pointer" onClick={() => navigate("/login")}>
              <CardContent className="p-8 h-full flex flex-col justify-center">
                <div className="flex items-start justify-between">
                  <div className="space-y-4">
                    <div className="p-3 bg-primary/10 rounded-xl w-fit">
                      <LogIn className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">Staff Portal</h3>
                      <p className="text-muted-foreground text-sm font-medium">Log in to view your attendance history, disputes, and profile.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </CardContent>
            </Card>

            <div className="p-6 border rounded-2xl bg-muted/30 border-dashed flex items-center justify-between opacity-60 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-2 w-2 rounded-full animate-pulse",
                  isOnline ? "bg-green-500" : "bg-amber-500"
                )} />
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  {isOnline ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
                  {isOnline ? "Cloud Connected" : "Local-Only Mode"}
                </span>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground italic tracking-widest uppercase">V 2.2.0-STABLE</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-40">
          Powered by Nasida Advanced Recognition Engine
        </div>
      </div>
    </div>
  );
}
