import type { SelectOption } from "./timeOptions";

export const bodyPlacementOptions: SelectOption[] = [
  { value: "Head", label: "Head" },
  { value: "Face", label: "Face" },
  { value: "Neck", label: "Neck" },
  { value: "Chest", label: "Chest" },
  { value: "Sternum", label: "Sternum" },
  { value: "Ribs", label: "Ribs" },
  { value: "Stomach", label: "Stomach" },
  { value: "Back", label: "Back" },
  { value: "Shoulder", label: "Shoulder" },
  { value: "Upper arm", label: "Upper arm" },
  { value: "Forearm", label: "Forearm" },
  { value: "Wrist", label: "Wrist" },
  { value: "Hand", label: "Hand" },
  { value: "Hip", label: "Hip" },
  { value: "Thigh", label: "Thigh" },
  { value: "Knee", label: "Knee" },
  { value: "Calf", label: "Calf" },
  { value: "Ankle", label: "Ankle" },
  { value: "Foot", label: "Foot" },
  { value: "Not sure yet", label: "Not sure yet" },
];

export const tattooSizeOptions: SelectOption[] = [
  { value: "Micro / tiny", label: "Micro / tiny (under 2 inches)" },
  { value: "Small", label: "Small (2-4 inches)" },
  { value: "Medium", label: "Medium (4-6 inches)" },
  { value: "Large", label: "Large (6-10 inches)" },
  { value: "Extra large", label: "Extra large (10+ inches)" },
];

export const tattooBudgetOptions: SelectOption[] = [
  { value: "0-100", label: "$0-$100" },
  { value: "100-200", label: "$100-$200" },
  { value: "200-350", label: "$200-$350" },
  { value: "350-500", label: "$350-$500" },
  { value: "500-750", label: "$500-$750" },
  { value: "750-1000", label: "$750-$1,000" },
  { value: "1000+", label: "$1,000+" },
  { value: "custom", label: "Other (enter manually)" },
];
