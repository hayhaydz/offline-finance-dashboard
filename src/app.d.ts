import type { User, Session } from "$lib/db/schema";

declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session & { user: User };
		}
	}
}
