import { User, sequelize } from "./models/userModel.js";

async function showAllUsers() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");
    
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    
    console.log("\n📋 All Existing Accounts:");
    console.log("=" .repeat(80));
    
    if (users.length === 0) {
      console.log("No users found in the database.");
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ID: ${user.id}`);
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role.toUpperCase()}`);
        console.log(`   Created: ${new Date(user.createdAt).toLocaleDateString()}`);
        console.log("-".repeat(50));
      });
      
      console.log(`\n📊 Total Users: ${users.length}`);
      
      const adminCount = users.filter(u => u.role === 'admin').length;
      const userCount = users.filter(u => u.role === 'user').length;
      
      console.log(`👑 Admins: ${adminCount}`);
      console.log(`👤 Regular Users: ${userCount}`);
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

showAllUsers();