import { RemoteHub, hubMetadata } from "../RemoteHub";

export const generateMetadata = () => hubMetadata("remote-work");

export default function RemoteWorkPage() {
  return <RemoteHub kind="remote-work" />;
}
