import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { calendarMonthForShortcut, quickCalendarRange, type CalendarKeyboardShortcut } from "@/lib/calendar-presets";

type CalendarRangePickerProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
};

const amber = "#FDB913";
const teal = "#2DD4BF";
const muted = "#91A2B8";
const border = "#33465F";

function dateOnlyToUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateToOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

  function sameDay(left: Date | null, right: Date) {
  return Boolean(left && dateToOnly(left) === dateToOnly(right));
}

export function WebCalendarRangePicker({ startDate, endDate, onStartDateChange, onEndDateChange, onApply, onClear }: CalendarRangePickerProps) {
  const today = useMemo(() => {
    const current = new Date();
    return new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));
  }, []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(dateOnlyToUtc(startDate) ?? today));
  const start = dateOnlyToUtc(startDate);
  const end = dateOnlyToUtc(endDate);
  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const firstWeekday = visibleMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), day)) : null;
  });

  const chooseDate = (date: Date) => {
    if (date > today) return;
    const value = dateToOnly(date);
    if (!startDate || (startDate && endDate)) {
      onStartDateChange(value);
      onEndDateChange("");
    } else if (start && date < start) {
      onStartDateChange(value);
    } else {
      onEndDateChange(value);
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        setVisibleMonth((month) => calendarMonthForShortcut(month, event.key as CalendarKeyboardShortcut));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const chooseQuickRange = (days: 7 | 30 | 90) => {
    const range = quickCalendarRange(days);
    onStartDateChange(range.startDate);
    onEndDateChange(range.endDate);
    setVisibleMonth(startOfMonth(dateOnlyToUtc(range.startDate) ?? today));
  };

  return (
    <View style={styles.card} accessibilityLabel="Custom news archive calendar">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Choose an exact archive range</Text>
          <Text style={styles.hint}>Select a start date, then an end date. Maximum one year.</Text>
        </View>
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear custom archive dates" style={styles.clearButton}>
          <Ionicons name="close" size={15} color={muted} />
        </Pressable>
      </View>
      <View style={styles.quickPresetRow}><Text style={styles.quickPresetLabel}>QUICK RANGE</Text><Pressable onPress={() => chooseQuickRange(7)} accessibilityRole="button" accessibilityLabel="Select last 7 days" style={styles.quickPresetButton}><Text style={styles.quickPresetText}>Last 7 Days</Text></Pressable><Pressable onPress={() => chooseQuickRange(30)} accessibilityRole="button" accessibilityLabel="Select last 30 days" style={styles.quickPresetButton}><Text style={styles.quickPresetText}>Last 30 Days</Text></Pressable><Pressable onPress={() => chooseQuickRange(90)} accessibilityRole="button" accessibilityLabel="Select last 90 days" style={styles.quickPresetButton}><Text style={styles.quickPresetText}>Last 90 Days</Text></Pressable></View>
      <Text style={styles.keyboardHint}>Keyboard: ←/→ month · Page Up/Down year</Text>
      <View style={styles.monthHeader} accessibilityRole="header">
        <Pressable onPress={() => setVisibleMonth((month) => calendarMonthForShortcut(month, "ArrowLeft"))} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.monthButton}>
          <Ionicons name="chevron-back" size={16} color={amber} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={() => setVisibleMonth((month) => calendarMonthForShortcut(month, "ArrowRight"))} accessibilityRole="button" accessibilityLabel="Next month" style={styles.monthButton}>
          <Ionicons name="chevron-forward" size={16} color={amber} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>{["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <Text key={`${label}-${index}`} style={styles.weekLabel}>{label}</Text>)}</View>
      <View style={styles.grid}>{cells.map((date, index) => {
        if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;
        const value = dateToOnly(date);
        const isStart = sameDay(start, date);
        const isEnd = sameDay(end, date);
        const inRange = Boolean(start && end && date >= start && date <= end);
        const disabled = date > today;
        return <Pressable key={value} onPress={() => chooseDate(date)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${value}${isStart ? ", start date" : isEnd ? ", end date" : ""}${disabled ? ", unavailable" : ""}`} style={[styles.dayCell, inRange && styles.rangeCell, isStart && styles.startCell, isEnd && styles.endCell, disabled && styles.disabledDay]}><Text style={[styles.dayText, inRange && styles.rangeText, (isStart || isEnd) && styles.edgeText, disabled && styles.disabledText]}>{date.getUTCDate()}</Text></Pressable>;
      })}</View>
      <View style={styles.selectionRow}><Text style={styles.selectionText}>Start: <Text style={styles.selectionValue}>{startDate || "Not selected"}</Text></Text><Text style={styles.selectionText}>End: <Text style={styles.selectionValue}>{endDate || "Not selected"}</Text></Text></View>
      <View style={styles.actions}><Pressable onPress={onClear} accessibilityRole="button" style={styles.cancelButton}><Text style={styles.cancelText}>Clear</Text></Pressable><Pressable onPress={onApply} accessibilityRole="button" style={styles.applyButton}><Ionicons name="checkmark-circle-outline" size={15} color="#08111F" /><Text style={styles.applyText}>Apply range</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: amber + "55", backgroundColor: "#0D1728", maxWidth: 460 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  title: { color: "#F4F7FB", fontSize: 13, fontWeight: "800" },
  hint: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  clearButton: { padding: 4 },
  quickPresetRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, marginBottom: 2, flexWrap: "wrap" },
  quickPresetLabel: { color: muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.7, marginRight: 2 },
  quickPresetButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: amber + "66", backgroundColor: amber + "12" },
  quickPresetText: { color: amber, fontSize: 9, fontWeight: "800" },
  keyboardHint: { color: muted, fontSize: 9, marginTop: 7 },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7, marginBottom: 8 },
  monthButton: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: amber + "12" },
  monthLabel: { color: "#F4F7FB", fontSize: 12, fontWeight: "800" },
  weekRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 4 },
  weekLabel: { width: 34, textAlign: "center", color: muted, fontSize: 9, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.2857%", minWidth: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  dayText: { color: "#D9E4F0", fontSize: 11 },
  rangeCell: { backgroundColor: teal + "20", borderRadius: 0 },
  startCell: { backgroundColor: teal, borderTopLeftRadius: 7, borderBottomLeftRadius: 7 },
  endCell: { backgroundColor: teal, borderTopRightRadius: 7, borderBottomRightRadius: 7 },
  rangeText: { color: "#B9F7EF" },
  edgeText: { color: "#08111F", fontWeight: "800" },
  disabledDay: { opacity: 0.32 },
  disabledText: { color: muted },
  selectionRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: border },
  selectionText: { color: muted, fontSize: 10 },
  selectionValue: { color: "#D9E4F0", fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 11 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: border },
  cancelText: { color: muted, fontSize: 10, fontWeight: "800" },
  applyButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: amber },
  applyText: { color: "#08111F", fontSize: 10, fontWeight: "800" },
});
