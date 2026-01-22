import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

async function cleanup() {
  try {
    console.log('Starting duplicate cleanup...');
    await sequelize.authenticate();
    
    // Find duplicate related_task_ids
    const duplicates: { related_task_id: string, count: number }[] = await sequelize.query(
      `SELECT related_task_id, COUNT(*) as count 
       FROM payments 
       WHERE related_task_id IS NOT NULL 
       GROUP BY related_task_id 
       HAVING count > 1`,
      { type: QueryTypes.SELECT }
    );

    console.log(`Found ${duplicates.length} tasks with duplicate payments.`);

    for (const dup of duplicates) {
      console.log(`Cleaning up duplicates for task: ${dup.related_task_id}`);
      
      // Get all payments for this task, ordered by creation (keep newest)
      const paymonts: { id: string }[] = await sequelize.query(
        `SELECT id FROM payments WHERE related_task_id = :taskId ORDER BY created_at DESC`,
        { 
          replacements: { taskId: dup.related_task_id },
          type: QueryTypes.SELECT 
        }
      );

      // Keep the first one (newest), delete the rest
      const toDelete = paymonts.slice(1);
      
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map(p => p.id);
        await sequelize.query(
            `DELETE FROM payments WHERE id IN (:ids)`,
            { replacements: { ids: idsToDelete } }
        );
        console.log(`Deleted ${idsToDelete.length} duplicate payments for task ${dup.related_task_id}`);
      }
    }

    console.log('Cleanup complete.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanup(); // Fix: Call the function "duplicates" -> "cleanup" 
// (I named the function 'cleanup duplicates' which is invalid syntax in line 4, will fix in write)
