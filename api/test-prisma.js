require('dotenv').config();
const {PrismaClient} = require('@prisma/client');
const {PrismaPg} = require('@prisma/adapter-pg');
const p = new PrismaClient({adapter: new PrismaPg({connectionString: process.env.DATABASE_URL})});
console.log('ok:', !!p.todo);
p.$disconnect();
