const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const Category = require('../models/Category');
const User = require('../models/User');
const connectDB = require('../config/database');

const seedDatabase = async () => {
  try {
    await connectDB();
    
    console.log('🗑️  Clearing existing data...');
    await Category.deleteMany({});
    await User.deleteMany({});
    
    console.log('📁 Creating categories...');
    const categories = [
      { name: 'Audio', parent_id: null },
      { name: 'TV', parent_id: null },
      { name: 'Accessories', parent_id: null },
      { name: 'Utensils', parent_id: null },
      { name: 'Electronics', parent_id: null },
      { name: 'Kitchen', parent_id: null }
    ];
    
    const createdCategories = [];
    for (const cat of categories) {
      const newCat = await Category.create(cat);
      createdCategories.push(newCat);
      console.log(`  ✅ Created category: ${cat.name}`);
    }
    
    const utensilsCategory = createdCategories.find(c => c.name === 'Utensils');
    const audioCategory = createdCategories.find(c => c.name === 'Audio');
    const accessoriesCategory = createdCategories.find(c => c.name === 'Accessories');
    
    const utensilsSubs = ['Knives', 'Cookware', 'Cutlery', 'Kitchen Tools'];
    for (const sub of utensilsSubs) {
      await Category.create({ name: sub, parent_id: utensilsCategory._id });
      console.log(`  ✅ Created subcategory: ${sub} (under Utensils)`);
    }
    
    const audioSubs = ['Headphones', 'Speakers', 'Earbuds', 'Microphones'];
    for (const sub of audioSubs) {
      await Category.create({ name: sub, parent_id: audioCategory._id });
      console.log(`  ✅ Created subcategory: ${sub} (under Audio)`);
    }
    
    const accessoriesSubs = ['Chargers', 'Cables', 'Power Banks', 'Adapters'];
    for (const sub of accessoriesSubs) {
      await Category.create({ name: sub, parent_id: accessoriesCategory._id });
      console.log(`  ✅ Created subcategory: ${sub} (under Accessories)`);
    }
    
    console.log('👤 Creating admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      username: 'admin',
      password: hashedPassword,
      email: 'admin@yetu.com',
      role: 'admin'
    });
    
    console.log('\n✅ Database seeded successfully!');
    console.log('📊 Statistics:');
    console.log(`   - Categories: ${await Category.countDocuments()}`);
    console.log(`   - Admin User: 1`);
    console.log('\n🔑 Admin Login:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n📸 To add products:');
    console.log('   1. Login to admin panel');
    console.log('   2. Click "Add New Product"');
    console.log('   3. Upload product image');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
