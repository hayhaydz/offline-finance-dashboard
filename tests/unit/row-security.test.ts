import { describe, it, expect } from 'vitest';
import {
	withUserFilter,
	validateUserAccess,
	checkUserAccess,
	validateAllUserAccess
} from '$lib/auth/row-security';
import type { User } from '$lib/db/schema';

// Mock user for testing
const mockUser1: User = {
	id: 1,
	username: 'user1',
	passwordHash: 'hash',
	totpSecret: 'secret',
	totpSecretIV: 'iv',
	passwordSalt: 'salt',
	createdAt: new Date()
};

const mockUser2: User = {
	id: 2,
	username: 'user2',
	passwordHash: 'hash',
	totpSecret: 'secret',
	totpSecretIV: 'iv',
	passwordSalt: 'salt',
	createdAt: new Date()
};

// Mock resource with userId
interface MockResource {
	id: number;
	userId: number;
	name: string;
}

describe('row-security', () => {
	describe('withUserFilter', () => {
		it('should create a user filter condition', () => {
			const table = { userId: 1 } as any;
			const filter = withUserFilter(1, table);
			expect(filter).toBeDefined();
			// In real tests, you'd verify the SQL condition
		});

		it('should create a filter for user 1', () => {
			const table = { userId: 1 } as any;
			const filter = withUserFilter(1, table);
			expect(filter).toBeDefined();
		});

		it('should create a filter for user 2', () => {
			const table = { userId: 2 } as any;
			const filter = withUserFilter(2, table);
			expect(filter).toBeDefined();
		});
	});

	describe('validateUserAccess', () => {
		it('should not throw when user owns the resource', () => {
			const resource: MockResource = {
				id: 1,
				userId: 1,
				name: 'Resource 1'
			};

			expect(() => {
				validateUserAccess(resource, mockUser1, 'Resource');
			}).not.toThrow();
		});

		it('should throw when user does not own the resource', () => {
			const resource: MockResource = {
				id: 1,
				userId: 2, // Belongs to user 2
				name: 'Resource 1'
			};

			expect(() => {
				validateUserAccess(resource, mockUser1, 'Resource');
			}).toThrow('permission');
		});

		it('should throw when resource is null', () => {
			expect(() => {
				validateUserAccess(null, mockUser1, 'Resource');
			}).toThrow('not found');
		});

		it('should throw when resource is undefined', () => {
			expect(() => {
				validateUserAccess(undefined, mockUser1, 'Resource');
			}).toThrow('not found');
		});

		it('should include resource type in error message', () => {
			const resource: MockResource = {
				id: 1,
				userId: 2,
				name: 'Resource 1'
			};

			expect(() => {
				validateUserAccess(resource, mockUser1, 'Account');
			}).toThrow('account');
		});
	});

	describe('checkUserAccess', () => {
		it('should return true when user owns the resource', () => {
			const resource: MockResource = {
				id: 1,
				userId: 1,
				name: 'Resource 1'
			};

			const result = checkUserAccess(resource, mockUser1);
			expect(result).toBe(true);
		});

		it('should return false when user does not own the resource', () => {
			const resource: MockResource = {
				id: 1,
				userId: 2, // Belongs to user 2
				name: 'Resource 1'
			};

			const result = checkUserAccess(resource, mockUser1);
			expect(result).toBe(false);
		});

		it('should return false when resource is null', () => {
			const result = checkUserAccess(null, mockUser1);
			expect(result).toBe(false);
		});

		it('should return false when resource is undefined', () => {
			const result = checkUserAccess(undefined, mockUser1);
			expect(result).toBe(false);
		});

		it('should narrow type correctly when true', () => {
			const resource: MockResource = {
				id: 1,
				userId: 1,
				name: 'Resource 1'
			};

			if (checkUserAccess(resource, mockUser1)) {
				// TypeScript should know resource is defined here
				expect(resource.name).toBe('Resource 1');
			}
		});
	});

	describe('validateAllUserAccess', () => {
		it('should not throw when user owns all resources', () => {
			const resources: MockResource[] = [
				{ id: 1, userId: 1, name: 'Resource 1' },
				{ id: 2, userId: 1, name: 'Resource 2' },
				{ id: 3, userId: 1, name: 'Resource 3' }
			];

			expect(() => {
				validateAllUserAccess(resources, mockUser1, 'Resource');
			}).not.toThrow();
		});

		it('should throw when user does not own one resource', () => {
			const resources: MockResource[] = [
				{ id: 1, userId: 1, name: 'Resource 1' },
				{ id: 2, userId: 2, name: 'Resource 2' }, // Belongs to user 2
				{ id: 3, userId: 1, name: 'Resource 3' }
			];

			expect(() => {
				validateAllUserAccess(resources, mockUser1, 'Resource');
			}).toThrow('permission');
		});

		it('should throw when user does not own any resources', () => {
			const resources: MockResource[] = [
				{ id: 1, userId: 2, name: 'Resource 1' },
				{ id: 2, userId: 2, name: 'Resource 2' }
			];

			expect(() => {
				validateAllUserAccess(resources, mockUser1, 'Resource');
			}).toThrow('permission');
		});

		it('should not throw for empty array', () => {
			expect(() => {
				validateAllUserAccess([], mockUser1, 'Resource');
			}).not.toThrow();
		});

		it('should include resource type in error message', () => {
			const resources: MockResource[] = [
				{ id: 1, userId: 1, name: 'Resource 1' },
				{ id: 2, userId: 2, name: 'Resource 2' }
			];

			expect(() => {
				validateAllUserAccess(resources, mockUser1, 'Account');
			}).toThrow('account');
		});
	});
});
