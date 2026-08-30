import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

export type DateFilter = "all" | "today" | "weekend" | "week";
type FilterKind = "date" | "genre" | "price";
type Props = {
  date: DateFilter;
  genre: string | null;
  price: number | null;
  genres: string[];
  onDate: (value: DateFilter) => void;
  onGenre: (value: string | null) => void;
  onPrice: (value: number | null) => void;
};

const dateLabels: Record<DateFilter, string> = {
  all: "Toutes les dates",
  today: "Aujourd’hui",
  weekend: "Ce week-end",
  week: "7 prochains jours",
};
const priceLabels = new Map<number | null, string>([
  [null, "Tous les prix"],
  [1500, "Jusqu’à 15 €"],
  [3000, "Jusqu’à 30 €"],
  [5000, "Jusqu’à 50 €"],
]);

export default function UpcomingFilters(props: Props) {
  const [open, setOpen] = useState<FilterKind | null>(null);
  const rows =
    open === "date"
      ? (Object.entries(dateLabels) as [DateFilter, string][]).map(
          ([value, label]) => ({ value, label, active: props.date === value }),
        )
      : open === "genre"
        ? [
            {
              value: null,
              label: "Tous les styles",
              active: props.genre === null,
            },
            ...props.genres.map((value) => ({
              value,
              label: value,
              active: props.genre === value,
            })),
          ]
        : [...priceLabels].map(([value, label]) => ({
            value,
            label,
            active: props.price === value,
          }));
  function choose(value: string | number | null) {
    if (open === "date") props.onDate(value as DateFilter);
    if (open === "genre") props.onGenre(value as string | null);
    if (open === "price") props.onPrice(value as number | null);
    setOpen(null);
  }
  return (
    <>
      <View style={s.pills}>
        <Pill
          kind="date"
          accessibilityLabel="Filtrer par date"
          active={props.date !== "all"}
          onPress={() => setOpen("date")}
        />
        <Pill
          kind="genre"
          accessibilityLabel="Filtrer par musique"
          active={props.genre !== null}
          onPress={() => setOpen("genre")}
        />
        <Pill
          kind="price"
          accessibilityLabel="Filtrer par prix"
          active={props.price !== null}
          onPress={() => setOpen("price")}
        />
      </View>
      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <Pressable style={s.backdrop} onPress={() => setOpen(null)}>
          <Pressable
            style={s.sheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={s.handle} />
            <Text style={s.title}>
              {open === "date"
                ? "Choisir une date"
                : open === "genre"
                  ? "Choisir un style"
                  : "Choisir un prix"}
            </Text>
            <ScrollView style={s.list}>
              {rows.map((row) => (
                <Pressable
                  key={String(row.value)}
                  style={[s.row, row.active && s.rowActive]}
                  onPress={() => choose(row.value)}
                >
                  <Text style={[s.rowText, row.active && s.rowTextActive]}>
                    {row.label}
                  </Text>
                  {row.active ? <Text style={s.check}>✓</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.close} onPress={() => setOpen(null)}>
              <Text style={s.closeText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Pill({
  kind,
  active,
  onPress,
  accessibilityLabel,
}: {
  kind: FilterKind;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const color = active ? "#53F6D4" : "#A4A8B8",
    common = {
      fill: "none",
      stroke: color,
      strokeWidth: 1.8,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      style={[s.pill, active && s.pillActive]}
      onPress={onPress}
    >
      <Svg width={21} height={21} viewBox="0 0 24 24">
        {kind === "date" ? (
          <>
            <Path
              {...common}
              d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v14H4V7a1 1 0 0 1 1-1Z"
            />
            <Path
              {...common}
              d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"
            />
          </>
        ) : kind === "genre" ? (
          <>
            <Path {...common} d="M9 18V5l10-2v13" />
            <Circle {...common} cx="6" cy="18" r="3" />
            <Circle {...common} cx="16" cy="16" r="3" />
          </>
        ) : (
          <>
            <Path
              {...common}
              strokeWidth={2}
              d="M17.5 6.5A7 7 0 1 0 17.5 17.5M6 10h9M6 14h8"
            />
          </>
        )}
      </Svg>
      {active ? <View style={s.activeDot} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  pills: { height: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  pill: {
    position: "relative",
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#292D42",
    borderRadius: 22,
    backgroundColor: "#101321",
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    borderColor: "rgba(83,246,212,.62)",
    backgroundColor: "rgba(83,246,212,.08)",
  },
  activeDot: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#53F6D4",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,.68)",
  },
  sheet: {
    maxHeight: "70%",
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#111421",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3C4156",
    marginBottom: 17,
  },
  title: {
    color: "#F8F7FF",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
  },
  list: { maxHeight: 360 },
  row: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#25293B",
  },
  rowActive: { backgroundColor: "rgba(83,246,212,.06)" },
  rowText: { color: "#D4D5DF", fontWeight: "800" },
  rowTextActive: { color: "#53F6D4" },
  check: { color: "#53F6D4", fontWeight: "900" },
  close: {
    padding: 15,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "#202438",
    alignItems: "center",
  },
  closeText: { color: "#9FA3B8", fontWeight: "900" },
});
