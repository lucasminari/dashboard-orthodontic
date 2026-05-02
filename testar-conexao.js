require('dotenv').config();
const { Client } = require('pg');

async function testar() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Conectando ao banco...');
    await client.connect();
    console.log('Conectado!');

    const resultado = await client.query('SELECT * FROM unidades ORDER BY id');
    console.log('\nUnidades cadastradas:');
    resultado.rows.forEach(u => {
      console.log(`  ${u.id} - ${u.nome} (pasta: ${u.drive_folder})`);
    });

    console.log(`\nTotal: ${resultado.rowCount} unidades`);
  } catch (e) {
    console.error('Deu erro:', e.message);
  } finally {
    await client.end();
  }
}

testar();