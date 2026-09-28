import { OwnerOnly } from "@/components/auth/OwnerOnly";

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return <OwnerOnly>{children}</OwnerOnly>;
}
