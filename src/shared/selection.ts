/** What's currently shown in the left pane's "selected" info card. */
export type Selection = { kind: "station"; stationId: string } | { kind: "train"; lineId: string; runRef: string } | null;
