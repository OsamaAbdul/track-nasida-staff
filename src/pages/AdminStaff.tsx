import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect } from "react";
import { MapPin } from "lucide-react";

export default function AdminStaff() {
  const { toast } = useToast();
  const [newDept, setNewDept] = useState("");

  const { data: departments, refetch: refetchDepts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*").order("name");
      return data || [];
    }
  });

  const { data: office, refetch: refetchOffice } = useQuery({
    queryKey: ["office-location"],
    queryFn: async () => {
      const { data } = await supabase
        .from("office_locations")
        .select("*")
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const [officeForm, setOfficeForm] = useState({
    name: "",
    radius_meters: 100,
    work_start: "09:00",
    work_end: "18:00",
    lat: 0,
    lng: 0,
    working_days: [1, 2, 3, 4, 5] as number[]
  });

  // Use useEffect to sync form when data loads
  useEffect(() => {
    if (office) {
      setOfficeForm({
        name: office.name,
        radius_meters: office.radius_meters,
        work_start: office.work_start,
        work_end: office.work_end,
        lat: office.latitude || 0,
        lng: office.longitude || 0,
        working_days: (office as any).working_days || [1, 2, 3, 4, 5]
      });
    }
  }, [office]);

  const { data: staff } = useQuery({
    queryKey: ["all-staff"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
      if (!profiles) return [];

      // Fetch roles for all users
      const userIds = profiles.map((p) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      return profiles.map((p) => ({
        ...p,
        roles: roles?.filter((r) => r.user_id === p.user_id).map((r) => r.role) ?? [],
      }));
    },
  });

  // Fetch today's attendance
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const { data: todayAttendance } = useQuery({
    queryKey: ["all-attendance-today"],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("user_id, status, check_in_at")
        .gte("check_in_at", todayStart)
        .lt("check_in_at", todayEnd);
      return data ?? [];
    },
  });

  const getAttendanceStatus = (userId: string) => {
    const log = todayAttendance?.find((a) => a.user_id === userId);
    return log ? log.status : "absent";
  };

  const roleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-destructive/10 text-destructive border-destructive/20";
      case "hr": return "bg-info/10 text-info border-info/20";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-success/10 text-success border-success/20";
      case "late": return "bg-warning/10 text-warning border-warning/20";
      default: return "bg-destructive/10 text-destructive border-destructive/20";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold font-display">Staff Management</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{staff?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Present Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{todayAttendance?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Absent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {(staff?.length ?? 0) - (todayAttendance?.length ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display">All Staff</CardTitle>
              <CardDescription>Overview of all registered staff members</CardDescription>
            </CardHeader>
            <CardContent>
              {staff && staff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Today</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell>{s.department || "—"}</TableCell>
                        <TableCell>{s.designation || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap items-center">
                            <div className="flex gap-1 flex-wrap">
                              {s.roles.map((r) => (
                                <Badge key={r} variant="outline" className={roleColor(r)}>
                                  {r}
                                </Badge>
                              ))}
                            </div>
                            <select
                              className="text-xs border rounded p-1 bg-background"
                              value={s.roles[0] || "staff"}
                              onChange={async (e) => {
                                const newRole = e.target.value;
                                const { error } = await supabase.rpc('update_user_role', {
                                  p_target_user_id: s.user_id,
                                  p_new_role: newRole as any
                                });
                                if (error) {
                                  toast({ title: "Update failed", description: error.message, variant: "destructive" });
                                } else {
                                  toast({ title: "Role updated", description: `${s.full_name} is now ${newRole}` });
                                  window.location.reload(); // Simple refresh to update UI
                                }
                              }}
                            >
                              <option value="staff">Staff</option>
                              <option value="hr">HR</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColor(getAttendanceStatus(s.user_id))}>
                            {getAttendanceStatus(s.user_id)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No staff members found.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <MapPin className="h-5 w-5 text-primary" />
                Office Location
              </CardTitle>
              <CardDescription>Configure geofence and work hours (Min 100m recommended for stability)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {office ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Office Name</Label>
                    <Input
                      value={officeForm.name}
                      onChange={e => setOfficeForm({ ...officeForm, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Latitude</Label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 text-[10px] font-bold uppercase tracking-tighter"
                          onClick={() => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => setOfficeForm(prev => ({ ...prev, lat: pos.coords.latitude, lng: pos.coords.longitude })),
                              (err) => toast({ title: "Portal Error", description: "Enable location access to detect coordinates.", variant: "destructive" })
                            );
                          }}
                        >
                          Detect
                        </Button>
                      </div>
                      <Input
                        type="number"
                        step="any"
                        value={officeForm.lat}
                        onChange={e => setOfficeForm({ ...officeForm, lat: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Longitude</Label>
                      <Input
                        type="number"
                        step="any"
                        value={officeForm.lng}
                        onChange={e => setOfficeForm({ ...officeForm, lng: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <a 
                      href={`https://www.google.com/maps?q=${officeForm.lat},${officeForm.lng}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 uppercase tracking-widest"
                    >
                      <MapPin className="h-3 w-3" />
                      Verify on Global Map
                    </a>
                  </div>
                  <div className="space-y-2">
                    <Label>Radius (meters)</Label>
                    <Input
                      type="number"
                      value={officeForm.radius_meters}
                      onChange={e => setOfficeForm({ ...officeForm, radius_meters: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Work Start</Label>
                      <Input
                        type="time"
                        value={officeForm.work_start}
                        onChange={e => setOfficeForm({ ...officeForm, work_start: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Work End</Label>
                      <Input
                        type="time"
                        value={officeForm.work_end}
                        onChange={e => setOfficeForm({ ...officeForm, work_end: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="text-xs uppercase font-black tracking-widest opacity-70">Working Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => (
                        <Button
                          key={day}
                          variant={officeForm.working_days.includes(idx) ? "default" : "outline"}
                          size="sm"
                          className="h-8 px-2.5 text-[10px] font-bold uppercase"
                          onClick={() => {
                            const newDays = officeForm.working_days.includes(idx)
                              ? officeForm.working_days.filter(d => d !== idx)
                              : [...officeForm.working_days, idx];
                            setOfficeForm({ ...officeForm, working_days: newDays.sort() });
                          }}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button className="w-full" onClick={async () => {
                    const { error } = await supabase
                      .from("office_locations")
                      .update({
                        name: officeForm.name,
                        radius_meters: officeForm.radius_meters,
                        work_start: officeForm.work_start,
                        work_end: officeForm.work_end,
                        latitude: officeForm.lat,
                        longitude: officeForm.lng,
                        working_days: officeForm.working_days
                      })
                      .eq("id", office.id);

                    if (error) {
                      toast({ title: "Update failed", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: "Success", description: "Office location updated." });
                      refetchOffice();
                    }
                  }}>
                    Save Changes
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">No active office location found.</p>
                  <Button onClick={async () => {
                    const { error } = await supabase.from("office_locations").insert({
                      name: "Main Office",
                      radius_meters: 100,
                      work_start: "09:00",
                      work_end: "18:00",
                      is_active: true,
                      latitude: 0,
                      longitude: 0,
                      working_days: [1, 2, 3, 4, 5]
                    });
                    if (error) {
                      toast({ title: "Creation failed", description: error.message, variant: "destructive" });
                    } else {
                      refetchOffice();
                    }
                  }}>Init Default Office</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Building className="h-5 w-5 text-primary" />
                Departments
              </CardTitle>
              <CardDescription>Manage organization departments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="New Department"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                />
                <Button size="icon" onClick={async () => {
                  if (!newDept) return;
                  const { error } = await supabase.from("departments").insert({ name: newDept });
                  if (error) {
                    toast({ title: "Failed to add", description: error.message, variant: "destructive" });
                  } else {
                    toast({ title: "Added", description: `Department ${newDept} created.` });
                    setNewDept("");
                    refetchDepts();
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {departments?.map((dept: any) => (
                  <div key={dept.id} className="flex items-center justify-between p-2 border rounded-md">
                    <span className="text-sm font-medium">{dept.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        const { error } = await supabase.from("departments").delete().eq("id", dept.id);
                        if (error) {
                          toast({ title: "Failed to delete", description: "Department might be in use.", variant: "destructive" });
                        } else {
                          toast({ title: "Deleted", description: `Department ${dept.name} removed.` });
                          refetchDepts();
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
