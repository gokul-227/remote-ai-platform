import { RemoteHub, hubMetadata } from "../RemoteHub";

export const generateMetadata = () => hubMetadata("work-from-home");

export default function WorkFromHomePage() {
  return <RemoteHub kind="work-from-home" />;
}
