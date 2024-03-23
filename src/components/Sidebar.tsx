import { ComponentChildren } from "preact"

interface SidebarProps {
	children: ComponentChildren;
}

export function Sidebar({ children }: SidebarProps) {

	return (
		<div class="sidebar">{children}</div>
	)
}
