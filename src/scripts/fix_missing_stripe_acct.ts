import { sequelize } from '../config/database';
import { Wallet } from '../models/Wallet';

async function fix() {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB");

    // We assume T03 is the user based on previous errors
    // If you are using a different user, change this ID
    const targetUserId = 'T03'; 

    const wallet = await Wallet.findOne({ where: { external_user_id: targetUserId } });
    
    if (wallet) {
        // Assign a 'Test' stripe account ID. 
        // NOTE: This will fail "Stripe" validation if you are hitting their real API 
        // with an invalid ID. This ONLY passes the internal check.
        // For real testing, use a real Connected Account ID from your Stripe Dashboard.
        wallet.stripe_account_id = 'acct_1032D82eZvKYlo2C'; 
        wallet.stripe_account_status = 'ACTIVE';
        await wallet.save();
        console.log(`Successfully assigned mock Stripe ID to user ${targetUserId}`);
    } else {
        console.log(`User ${targetUserId} not found. Creating wallet...`);
        await Wallet.create({
            external_user_id: targetUserId,
            external_username: targetUserId,
            stripe_account_id: 'acct_1032D82eZvKYlo2C',
            stripe_account_status: 'ACTIVE',
            role: 'service_provider',
            available_balance: 0,
            pending_balance: 0,
            currency: 'USD'
        });
        console.log(`Created wallet for ${targetUserId} with mock details.`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

fix();
