const { getDb } = require('../src/lib/db/client.cjs');

async function fixSortOrder() {
  const db = getDb();
  const { goals } = require('../src/lib/schema.cjs');
  const { eq } = require('drizzle-orm');

  const allGoals = await db.query.goals.findMany({
    where: eq(goals.deletedAt, null)
  });

  console.log(`Found ${allGoals.length} active goals`);

  for (let i = 0; i < allGoals.length; i++) {
    const goal = allGoals[i];
    await db.update(goals)
      .set({ sortOrder: i })
      .where(eq(goals.id, goal.id));
    console.log(`Set sortOrder=${i} for goal: ${goal.name}`);
  }

  console.log('Done!');
  process.exit(0);
}

fixSortOrder().catch(console.error);
