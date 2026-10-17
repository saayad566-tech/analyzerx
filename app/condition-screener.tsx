/**
 * Condition Lab — the user-facing surface for the Universal Custom Condition Screener.
 *
 * The user writes their own rule in the condition language (`RSI < 30 and Volume > 5x`,
 * `Price > 200 EMA and changePct(3) > 10%`), sees the canonical form the parser will actually
 * evaluate, saves it by name, and runs it across a pasted OHLCV universe.
 *
 * Everything shown here is real: the canonical text is the parsed AST, the error carries the
 * character position, and a series that is too short is reported as skipped rather than silently
 * counted as a non-match.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { ScreenContainer } from "@/components/screen-container";
import {
  Divider,
  EmptyState,
  Pill,
  PrimaryAction,
  SectionHeader,
  Surface,
} from "@/components/ui/premium";
import { color, radius, space, type } from "@/lib/design/tokens";
import { parseOhlcv } from "@/lib/quant/ohlcv";
import {
  addNamedCondition,
  loadNamedConditions,
  parseSymbolBlocks,
  saveNamedConditions,
  screenUniverse,
  validateCondition,
  type ConditionInstrument,
  type NamedCondition,
  type ScreenOutcome,
} from "@/lib/screener-conditions";

const EXAMPLES = [
  "RSI < 30 and Volume > 5x",
  "Price > 200 EMA and changePct(3) > 10%",
  "close > sma(50) and pctFromHigh(20) > -5%",
];

export default function ConditionLabScreen() {
  const [expression, setExpression] = useState(EXAMPLES[0]);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<NamedCondition[]>([]);
  const [ohlcv, setOhlcv] = useState("");
  const [outcome, setOutcome] = useState<ScreenOutcome | null>(null);
  const [parseNotes, setParseNotes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadNamedConditions().then((list) => {
      if (!cancelled) setSaved(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validation = useMemo(() => validateCondition(expression), [expression]);

  const runScreen = useCallback(() => {
    const blocks = parseSymbolBlocks(ohlcv);
    if (blocks.length === 0) {
      setOutcome(null);
      setParseNotes(["Paste at least one OHLCV series. Prefix a block with `# SYMBOL` to name it."]);
      return;
    }
    const instruments: ConditionInstrument[] = [];
    const notes: string[] = [];
    for (const block of blocks) {
      const parsed = parseOhlcv(block.body);
      if (parsed.status === "ok") {
        instruments.push({ symbol: block.symbol, market: "PASTED", candles: parsed.candles });
        notes.push(`${block.symbol}: ${parsed.candles.length} bar(s), ${parsed.dropped} dropped`);
      } else {
        notes.push(`${block.symbol}: could not parse — ${parsed.reason}`);
      }
    }
    setParseNotes(notes);
    setOutcome(screenUniverse(expression, instruments));
  }, [expression, ohlcv]);

  const save = useCallback(async () => {
    if (!validation.ok) return;
    const label = name.trim() || validation.canonical;
    const next = addNamedCondition(saved, {
      id: `${Date.now()}`,
      name: label,
      expression: expression.trim(),
      canonical: validation.canonical,
      createdAt: new Date().toISOString(),
    });
    setSaved(next);
    setName("");
    await saveNamedConditions(next);
  }, [expression, name, saved, validation]);

  const remove = useCallback(
    async (id: string) => {
      const next = saved.filter((item) => item.id !== id);
      setSaved(next);
      await saveNamedConditions(next);
    },
    [saved],
  );

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <SectionHeader
          eyebrow="CONDITION LAB"
          title="Custom condition screener"
          trailing={<Pill label="offline" tone="info" />}
        />

        <Surface level="raised">
          <Text style={styles.label}>Your condition</Text>
          <TextInput
            value={expression}
            onChangeText={setExpression}
            placeholder="RSI < 30 and Volume > 5x"
            placeholderTextColor={color.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          {validation.ok ? (
            <View style={styles.row}>
              <Pill label="parses" tone="confirmed" dot />
              <Text style={styles.canonical}>{validation.canonical}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Pill label="cannot parse" tone="alert" dot />
              <Text style={styles.error}>
                {validation.error.message} (position {validation.error.position})
              </Text>
            </View>
          )}

          <View style={styles.chips}>
            {EXAMPLES.map((example) => (
              <Pressable key={example} onPress={() => setExpression(example)} style={styles.chip}>
                <Text style={styles.chipText}>{example}</Text>
              </Pressable>
            ))}
          </View>
        </Surface>

        <Surface level="card">
          <Text style={styles.label}>Save this condition</Text>
          <View style={styles.saveRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor={color.textFaint}
              style={[styles.input, styles.flex]}
            />
            <PrimaryAction
              label="Save"
              icon="bookmark-outline"
              disabled={!validation.ok}
              onPress={() => {
                void save();
              }}
            />
          </View>
          {saved.length === 0 ? (
            <Text style={styles.hint}>No saved conditions yet.</Text>
          ) : (
            saved.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setExpression(item.expression)}
                style={styles.savedRow}
              >
                <View style={styles.flex}>
                  <Text style={styles.savedName}>{item.name}</Text>
                  <Text style={styles.savedCanonical}>{item.canonical}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`Delete ${item.name}`}
                  onPress={() => {
                    void remove(item.id);
                  }}
                  style={styles.deleteButton}
                >
                  <Ionicons name="close" size={16} color={color.textFaint} />
                </Pressable>
              </Pressable>
            ))
          )}
        </Surface>

        <Surface level="card">
          <Text style={styles.label}>Universe (paste OHLCV)</Text>
          <Text style={styles.hint}>
            One series per block, named with a `# SYMBOL` line. A header row is optional.
          </Text>
          <TextInput
            value={ohlcv}
            onChangeText={setOhlcv}
            placeholder={"# RELIANCE\ndate,open,high,low,close,volume\n2026-01-02,2900,2950,2880,2940,1200000"}
            placeholderTextColor={color.textFaint}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, styles.multiline]}
          />
          <PrimaryAction
            label="Run condition"
            icon="play"
            disabled={!validation.ok}
            onPress={runScreen}
          />
          {parseNotes.map((note) => (
            <Text key={note} style={styles.note}>
              {note}
            </Text>
          ))}
        </Surface>

        {outcome ? (
          <Surface level="raised">
            <SectionHeader
              eyebrow="RESULT"
              title={`${outcome.hits.length} match(es)`}
              trailing={<Pill label={`${outcome.evaluated} evaluated`} tone="neutral" />}
            />
            {outcome.hits.length === 0 ? (
              <EmptyState
                title="No instrument matched"
                detail={
                  outcome.evaluated === 0
                    ? "Nothing was evaluated — check the pasted series above."
                    : "Every evaluated series failed the condition. The clause detail below shows why."
                }
              />
            ) : (
              outcome.hits.map((hit) => (
                <View key={`${hit.market}:${hit.symbol}`} style={styles.hit}>
                  <View style={styles.row}>
                    <Text style={styles.hitSymbol}>{hit.symbol}</Text>
                    <Pill
                      label={hit.passed ? "matched" : "not matched"}
                      tone={hit.passed ? "confirmed" : "neutral"}
                      dot
                    />
                    {hit.insufficientData ? <Pill label="missing data" tone="alert" /> : null}
                  </View>
                  {hit.clauses.map((clause) => (
                    <Text key={clause.text} style={styles.clause}>
                      {clause.passed ? "✓" : "✗"} {clause.text} → {clause.left ?? "n/a"} vs{" "}
                      {clause.right ?? "n/a"}
                    </Text>
                  ))}
                  <Divider />
                </View>
              ))
            )}
            {outcome.skipped.length > 0 ? (
              <Text style={styles.note}>
                Skipped: {outcome.skipped.map((s) => `${s.symbol} (${s.reason})`).join(", ")}
              </Text>
            ) : null}
          </Surface>
        ) : null}

        <Text style={styles.footer}>
          A live multi-market scan needs a connected data provider; until one is configured this screen
          screens the series you paste, and says so rather than inventing numbers.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  label: { ...type.eyebrow, color: color.textFaint, textTransform: "uppercase", marginBottom: space.sm },
  input: {
    ...type.body,
    color: color.text,
    backgroundColor: color.canvasRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  multiline: { minHeight: 132, textAlignVertical: "top" },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap", marginTop: space.sm },
  canonical: { ...type.caption, color: color.confirmed, flexShrink: 1 },
  error: { ...type.caption, color: color.alert, flexShrink: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipText: { ...type.micro, color: color.textMuted },
  saveRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  savedName: { ...type.label, color: color.text },
  savedCanonical: { ...type.caption, color: color.textFaint },
  deleteButton: { padding: space.xs },
  hint: { ...type.caption, color: color.textFaint, marginTop: space.xs },
  note: { ...type.caption, color: color.textFaint, marginTop: space.xs },
  hit: { marginTop: space.md },
  hitSymbol: { ...type.title, color: color.text },
  clause: { ...type.caption, color: color.textMuted, marginTop: space.xs },
  footer: { ...type.caption, color: color.textFaint },
});
