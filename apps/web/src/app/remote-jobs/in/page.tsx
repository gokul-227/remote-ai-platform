import { RemoteHub, hubMetadata } from "../../RemoteHub";

export const generateMetadata = () => hubMetadata("countries");

export default function CountriesPage() {
  return <RemoteHub kind="countries" />;
}
