import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Calendar, ChevronLeft, ChevronRight, Search, FileText, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import nasidaLogo from "@/assets/nasida-logo.png";

type ReportPeriod = "day" | "week" | "month";

export default function AdminAttendance() {
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [department, setDepartment] = useState<string>("all-departments");
  const [printTimestamp, setPrintTimestamp] = useState("");

  useEffect(() => {
    setPrintTimestamp(format(new Date(), "PPpp"));
  }, []);

  const getRange = () => {
    switch (period) {
      case "day":
        return { start: startOfDay(referenceDate), end: endOfDay(referenceDate) };
      case "week":
        return { start: startOfWeek(referenceDate), end: endOfWeek(referenceDate) };
      case "month":
        return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
    }
  };

  const { start, end } = getRange();

  // Fetch departments for filter
  const { data: departments } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin-attendance-report", period, referenceDate.toISOString(), department],
    queryFn: async () => {
      let query = supabase
        .from("attendance_logs")
        .select(`
          *,
          profiles!inner (
            full_name,
            department,
            designation,
            user_id
          )
        `)
        .gte("check_in_at", start.toISOString())
        .lte("check_in_at", end.toISOString())
        .order("check_in_at", { ascending: false });

      if (department !== "all-departments") {
        query = query.eq("profiles.department", department);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const handlePrint = () => {
    setPrintTimestamp(format(new Date(), "PPpp"));
    window.print();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-green-100 text-green-800 border-green-200";
      case "late": return "bg-amber-100 text-amber-800 border-amber-200";
      case "absent": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const moveRange = (direction: number) => {
    const newDate = new Date(referenceDate);
    if (period === "day") newDate.setDate(newDate.getDate() + direction);
    if (period === "week") newDate.setDate(newDate.getDate() + (direction * 7));
    if (period === "month") newDate.setMonth(newDate.getMonth() + direction);
    setReferenceDate(newDate);
  };

  return (
    <div className="space-y-6 relative">
      {/* Watermark for Print */}
      <div className="hidden print:block fixed inset-0 z-[-1] pointer-events-none opacity-[0.03] flex items-center justify-center">
        <img src={nasidaLogo} alt="" className="w-[60%] rotate-[-30deg]" />
      </div>

      {/* Screen-only Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            Attendance Reports
          </h1>
          <p className="text-muted-foreground ml-11">Generate and print professional attendance sheets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2 border-primary/20 hover:bg-primary/10 transition-all font-semibold">
            <Printer className="h-4 w-4" /> Print Report
          </Button>
        </div>
      </div>

      {/* Screen-only Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Reporting Timeframe
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="bg-muted p-1 rounded-xl flex gap-1">
              {(["day", "week", "month"] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "capitalize text-xs h-8 px-4 rounded-lg transition-all",
                    period === p ? "shadow-sm bg-background text-primary" : "text-muted-foreground"
                  )}
                  onClick={() => {
                    setPeriod(p);
                    setReferenceDate(new Date());
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-l pl-4">
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5 rounded-full" onClick={() => moveRange(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg" onClick={() => setReferenceDate(new Date())}>
                Current
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5 rounded-full" onClick={() => moveRange(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card shadow-sm>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Staff Segment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-full h-8 text-xs border-primary/10 rounded-lg">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-departments">All Departments</SelectItem>
                {departments?.map((dept) => (
                  <SelectItem key={dept.name} value={dept.name}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Main Report Document */}
      <Card className="print:shadow-none print:border-none shadow-premium overflow-hidden">
        {/* Printable Official Header */}
        <div className="hidden print:flex items-start justify-between p-8 border-b-2 border-primary/20 bg-primary/5 mb-6">
          <div className="flex items-center gap-4">
            <img src={nasidaLogo} alt="NASIDA" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-primary font-display uppercase">Audit Report</h1>
              <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">NASIDA Attendance Intelligence</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="inline-block px-3 py-1 bg-primary text-white text-[10px] font-bold uppercase rounded-sm mb-2">
              {period} Summary
            </div>
            <p className="text-sm font-bold text-foreground">
              {period === "day" && format(referenceDate, "MMMM do, yyyy")}
              {period === "week" && `${format(start, "MMM do")} - ${format(end, "MMM do, yyyy")}`}
              {period === "month" && format(referenceDate, "MMMM yyyy")}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">
              Segment: {department === "all-departments" ? "A-Z STAFF DEPARTMENTS" : department}
            </p>
          </div>
        </div>

        {/* Screen Header */}
        <CardHeader className="print:hidden border-b bg-card/50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="font-display flex items-center gap-2 text-xl">
                <Calendar className="h-5 w-5 text-primary" />
                {period === "day" && format(referenceDate, "MMMM do, yyyy")}
                {period === "week" && `Week of ${format(start, "MMM do")} - ${format(end, "MMM do, yyyy")}`}
                {period === "month" && format(referenceDate, "MMMM yyyy")}
              </CardTitle>
              <CardDescription>
                {department === "all-departments" ? "Consolidated report for all staff" : `Segmented report for ${department} department`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="w-[220px] font-bold text-foreground text-[11px] uppercase tracking-wider pl-6">Full Name / ID</TableHead>
                  <TableHead className="font-bold text-foreground text-[11px] uppercase tracking-wider">Date</TableHead>
                  <TableHead className="font-bold text-foreground text-[11px] uppercase tracking-wider">Clock In</TableHead>
                  <TableHead className="font-bold text-foreground text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="print:hidden font-bold text-foreground text-[11px] uppercase tracking-wider">Department</TableHead>
                  <TableHead className="text-right font-bold text-foreground text-[11px] uppercase tracking-wider pr-6">Reliability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="text-sm font-medium">Processing Records...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-primary/5 transition-colors border-b">
                      <TableCell className="pl-6 group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary print:hidden group-hover:bg-primary/20">
                            {(log.profiles as any)?.full_name?.charAt(0) || "U"}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{(log.profiles as any)?.full_name || "Unknown User"}</p>
                            <p className="text-[9px] font-mono text-muted-foreground uppercase">
                              ID: {(log.profiles as any)?.user_id?.substring(0, 8) || "N/A"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm text-foreground/80">{format(new Date(log.check_in_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-mono text-sm">{format(new Date(log.check_in_at), "hh:mm a")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("px-2 py-0.5 h-6 text-[10px] capitalize font-bold", statusColor(log.status))}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="print:hidden">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-muted text-muted-foreground text-[9px] uppercase font-black tracking-tight h-5">
                            {(log.profiles as any)?.department || "UNCATEGORIZED"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-xs font-bold text-primary">
                            {log.face_match_score ? (log.face_match_score * 100).toFixed(1) + "%" : "BYPASSED"}
                          </span>
                          <span className="text-[8px] text-muted-foreground uppercase font-medium">Bionic Accuracy</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-20">
                      <div className="flex flex-col items-center gap-3 opacity-30">
                        <UserCheck className="h-16 w-16 text-muted-foreground" />
                        <div className="text-center">
                          <p className="text-lg font-black text-muted-foreground uppercase tracking-widest">No Logs Found</p>
                          <p className="text-sm italic">Clear filters or try a different date range</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Official Print Footer */}
          <div className="mt-auto hidden print:block pt-12 p-8 border-t-2 border-primary/10">
            <div className="grid grid-cols-3 gap-8 items-end">
              <div className="space-y-4">
                <div className="h-12 border-b border-muted"></div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dept Head Signature</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-primary tracking-widest uppercase mb-1">NASIDA SYSTEM AUDIT</p>
                <p className="text-[8px] text-muted-foreground">Certified electronic record. Page <span className="pageNumber"></span> of <span className="totalPages"></span></p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] text-foreground font-black uppercase">Official Timestamp</p>
                <p className="text-[10px] font-mono text-muted-foreground">{printTimestamp}</p>
                <p className="text-[8px] text-destructive uppercase font-bold italic tracking-tight">Internal Confidential Use Only</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screen-only Instructions */}
      <div className="print:hidden p-4 bg-primary/5 rounded-xl border border-primary/20 flex items-start gap-4">
        <div className="p-2 bg-primary rounded-lg">
          <Printer className="h-5 w-5 text-white" />
        </div>
        <div>
          <h4 className="font-bold text-primary text-sm uppercase tracking-tight">Print Pro-Tip</h4>
          <p className="text-xs text-muted-foreground">
            For the best result, select **"A4"** paper size and **"Portrait"** orientation in your browser's print settings. 
            Enable **"Background Graphics"** to see badges and icons.
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.5cm;
          }
          body { 
            background: white !important; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
            color: black !important;
          }
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; }
          .card { border: none !important; box-shadow: none !important; }
          .p-0 { padding: 0 !important; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          
          /* Page numbering hacks */
          .pageNumber::after { content: counter(page); }
          .totalPages::after { content: counter(pages); }
          
          tr { page-break-inside: avoid !important; }
          .badge { font-weight: bold !important; border: 1px solid #ddd !important; -webkit-print-color-adjust: exact !important; }
        }
      `}} />
    </div>
  );
}
