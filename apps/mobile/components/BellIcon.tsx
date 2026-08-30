import BrandIcon from "./BrandIcon";
export default function BellIcon({
  color = "#F8F7FF",
  size = 21,
}: {
  color?: string;
  size?: number;
}) {
  return <BrandIcon name="bell" color={color} size={size} />;
}
