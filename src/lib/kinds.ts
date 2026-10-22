// The kinds of place, in the order the filters and the Share form list them.
// A place's kind is stored by its key, so a key never changes: "fun" is
// what Activities was called before there were six, and the places shared
// as Fun are Activities now without a row being rewritten.
export type Kind = "food" | "coffee" | "drinks" | "outdoors" | "culture" | "fun";

export const KIND_LABEL: Record<Kind, string> = {
  food: "Food",
  coffee: "Coffee",
  drinks: "Drinks",
  outdoors: "Outdoors",
  culture: "Culture",
  fun: "Activities",
};
