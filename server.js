require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const fetch = require('node-fetch'); // Certifique-se de que 'node-fetch' está instalado: npm install node-fetch

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;

app.post('/analisar', upload.fields([
  { name: 'contatos', maxCount: 1 },
  { name: 'inadimplencia', maxCount: 1 }
]), async (req, res) => {
  try {
    // Verificando se os arquivos foram enviados
    if (!req.files || !req.files.contatos || !req.files.inadimplencia) {
      return res.status(400).json({ erro: 'Ambos os arquivos (contatos e inadimplencia) são obrigatórios.' });
    }

    const contatosPath = req.files.contatos[0].path;
    const inadimplenciaPath = req.files.inadimplencia[0].path;

    const contatosBuffer = fs.readFileSync(contatosPath);
    const inadimplenciaBuffer = fs.readFileSync(inadimplenciaPath);

    // Parseando os PDFs
    const contatosText = (await pdfParse(contatosBuffer)).text;
    const inadimplenciaText = (await pdfParse(inadimplenciaBuffer)).text;


    //Novo prompt com os dados dos PDFs
    const promptContatos = `
      A seguir está um bloco de texto extraído de PDF. Eu quero que voce me retorne um JSON com os objetos com os seguintes campos extraidos desse bloco, unidade por ex: 001, email e telefone, pode ignorar todas as outras informaçoes.
      Contatos:
      ${contatosText}
    `;

    // Novo prompt com os dados dos PDFs
    const promptInadimplentes = `
      A seguir está um bloco de texto extraído de PDF. Eu quero que voce me retorne um JSON que eu possa renderizar no front-end, com os objetos com os seguintes campos extraidos desse bloco, unidade por ex: 001, nome, pode ignorar todas as outras informaçoes.
      Inadimplencia:
      ${inadimplenciaText}
    `;

    //Chamada à API do Gemini com o modelo corrigido
    const geminiResponseContatos = await fetch(
      // Continuamos usando 'gemini-1.5-flash' ou 'gemini-1.5-pro'
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptContatos }] }]
        })
      }
    );

    const geminiResponseInandimplentes = await fetch(
      // Continuamos usando 'gemini-1.5-flash' ou 'gemini-1.5-pro'
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptInadimplentes }] }]
        })
      }
    );

    const resultContatos = await geminiResponseContatos.json();
    const textContatos = resultContatos.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const resultInandimplentes = await geminiResponseInandimplentes.json();
    const textInadimplentes = resultInandimplentes.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const cleanedContatos = textContatos.replace(/^```json\n/, '').replace(/\n```$/, '');
    const cleanedInadimplentes = textInadimplentes.replace(/^```json\n/, '').replace(/\n```$/, '');


    const resultado = JSON.parse(cleanedInadimplentes).map(n => {
    const contato = JSON.parse(cleanedContatos).find(c => c.unidade === n.unidade);
      return {
        unidade: n.unidade,
        nome: n.nome,
        email: contato?.email || null,
        telefone: contato?.telefone || null
      };
    });

    try {
      return res.json(resultado);
    } catch (e) {
      console.error("Erro ao converter resposta da Gemini para JSON:", e);
      return res.status(500).json({ 
        erro: 'Não consegui converter a resposta da Gemini em JSON. Verifique o formato.', 
        textoBruto: text,
        detalhesErroParse: e.message
      });
    } finally {
        // Limpar arquivos temporários após o processamento
        fs.unlinkSync(contatosPath);
        fs.unlinkSync(inadimplenciaPath);
    }
  } catch (err) {
    console.error("Erro na rota /analisar:", err);
    res.status(500).json({ erro: 'Erro interno do servidor ao processar os PDFs ou chamar a API Gemini.', detalhes: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});