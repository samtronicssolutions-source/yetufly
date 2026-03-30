const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import models
const Product = require('../models/Product');
const Category = require('../models/Category');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Your products data based on the images you uploaded
const products = [
  {
    name: 'P64 MAX Solar Power Bank',
    description: '20,000mAh solar power bank with 4 removable cables, 2 torches, holder and string. Excellent quality, never gets swollen.',
    price: 3500,
    image: '/images/products/p64max.jpg',
    stock: 50,
    featured: true
  },
  {
    name: 'C35 Max Speed Cable',
    description: '3X micro fast charging cable with max speed technology. Fast and safe 3A charging.',
    price: 450,
    image: '/images/products/c35.jpg',
    stock: 100,
    featured: true
  },
  {
    name: 'E4 Metal Extra Bass Headset',
    description: '4X extra bass headset with metal build. 1.2M long wire, 3.5mm and Type-C compatible. Excellent quality sound.',
    price: 1200,
    image: '/images/products/e4.jpg',
    stock: 75,
    featured: true
  },
  {
    name: 'T10 True Wireless Earbuds',
    description: 'Extra bass true wireless earbuds. Comfortable to wear, lightweight design with smart touch controls.',
    price: 2500,
    image: '/images/products/t10.jpg',
    stock: 60,
    featured: true
  },
  {
    name: 'T9 OWS Wireless Earphones',
    description: 'Open wireless earphones with comfortable fit. Smart touch controls and low latency. Excellent quality sound.',
    price: 2800,
    image: '/images/products/t9ows.jpg',
    stock: 45,
    featured: true
  },
  {
    name: '65W Fast Charger with Retractable Cable',
    description: '3-in-1 cable charger with 65W super charging. 65cm retractable cable, smart chip inside. Supports phone and laptop charging.',
    price: 3200,
    image: '/images/products/ch3.jpg',
    stock: 40,
    featured: true
  },
  {
    name: '4-in-1 Charger Kit',
    description: 'One cable with four connectors: Type-C, Micro, and USB. Fast charging with indicator light. Excellent quality.',
    price: 1500,
    image: '/images/products/ch4.jpg',
    stock: 80,
    featured: false
  },
  {
    name: '25W PD Fast Adapter',
    description: 'Type-C fast charging adapter with PD technology. Compact and efficient design.',
    price: 1200,
    image: '/images/products/ad1.jpg',
    stock: 100,
    featured: false
  },
  {
    name: 'EX-015 Fast Charger',
    description: '3 times charging speed with Type-C connection. Cool technology for fast and efficient charging.',
    price: 1800,
    image: '/images/products/ex015.jpg',
    stock: 60,
    featured: false
  },
  {
    name: 'Professional Hair Dryer',
    description: '3000W professional hair dryer with multiple heat settings. Perfect for salon or home use.',
    price: 3500,
    image: '/images/products/hairdryer.jpg',
    stock: 30,
    featured: false
  },
  {
    name: 'Professional Clipper Set',
    description: 'Professional hair clipper with 4 guided combs. Powerful and precise cutting.',
    price: 4200,
    image: '/images/products/clipper.jpg',
    stock: 25,
    featured: true
  },
  {
    name: 'Premium Kitchen Knife Set',
    description: 'High-quality stainless steel knife set with ergonomic handles. Includes chef knife, paring knife, and bread knife.',
    price: 4500,
    image: '/images/products/knives.jpg',
    stock: 25,
    featured: true
  },
  {
    name: 'Blender & Grinder 2-in-1',
    description: 'Powerful blender and grinder combo. Safety lock, durable design. Enjoy every drop of nutrients.',
    price: 5500,
    image: '/images/products/blender.jpg',
    stock: 20,
    featured: true
  },
  {
    name: 'Professional Audio Amplifier',
    description: 'Hi-Fi stereo audio amplifier with Bluetooth, USB/SD support. Professional sound quality with wireless function.',
    price: 8500,
    image: '/images/products/amplifier.jpg',
    stock: 15,
    featured: true
  },
  {
    name: 'Wireless Speaker System',
    description: 'High power wireless speaker with flashing lights. Safety battery and great sound quality.',
    price: 5500,
    image: '/images/products/speaker.jpg',
    stock: 20,
    featured: true
  },
  {
    name: 'Wireless Microphone System',
    description: 'Professional wireless microphone system with outstanding stability and easy operation. Perfect for events and performances.',
    price: 12500,
    image: '/images/products/microphone.jpg',
    stock: 10,
    featured: false
  },
  {
    name: 'Miniature Circuit Breaker',
    description: 'High-quality DZ47-63 miniature circuit breaker for electrical safety. Reliable protection for your home.',
    price: 350,
    image: '/images/products/breaker.jpg',
    stock: 100,
    featured: false
  },
  {
    name: 'Smart Power Socket',
    description: '2500W smart power socket with 4 ports. USB and PD charging support. 1.8m cable length.',
    price: 2800,
    image: '/images/products/socket.jpg',
    stock: 45,
    featured: true
  }
];

async function addProducts() {
  try {
    // Get categories
    const accessoriesCategory = await Category.findOne({ name: 'Accessories' });
    const audioCategory = await Category.findOne({ name: 'Audio' });
    const utensilsCategory = await Category.findOne({ name: 'Utensils' });
    const tvCategory = await Category.findOne({ name: 'TV' });

    if (!accessoriesCategory || !audioCategory || !utensilsCategory) {
      console.log('Categories not found. Please run the seed script first.');
      process.exit(1);
    }

    // Map products to categories
    const categorizedProducts = products.map(product => {
      let category_id = accessoriesCategory._id;
      
      if (product.name.includes('Headset') || 
          product.name.includes('Earphones') || 
          product.name.includes('Earbuds') ||
          product.name.includes('Amplifier') ||
          product.name.includes('Speaker') ||
          product.name.includes('Microphone')) {
        category_id = audioCategory._id;
      } else if (product.name.includes('Knife') || 
                 product.name.includes('Blender') ||
                 product.name.includes('Grinder')) {
        category_id = utensilsCategory._id;
      }
      
      return {
        ...product,
        category_id
      };
    });

    // Add products to database
    for (const product of categorizedProducts) {
      const existingProduct = await Product.findOne({ name: product.name });
      if (!existingProduct) {
        await Product.create(product);
        console.log(`✅ Added: ${product.name}`);
      } else {
        console.log(`⏭️  Skipped (exists): ${product.name}`);
      }
    }

    console.log('\n🎉 All products added successfully!');
    console.log(`📊 Total products: ${await Product.countDocuments()}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding products:', error);
    process.exit(1);
  }
}

addProducts();
