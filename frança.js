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


    // Novo prompt com os dados dos PDFs
    const prompt = `
      A seguir está um bloco de texto extraído de PDF. Eu quero que voce me retorne um JSON com os objetos com os seguintes campos extraidos desse bloco, unidade, email e telefone, pode ignorar todas as outras informaçoes.

      Contatos:
      ${contatosText}

    `;

    // Chamada à API do Gemini com o modelo corrigido
    const geminiResponse = await fetch(
       // Continuamos usando 'gemini-1.5-flash' ou 'gemini-1.5-pro'
       'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const result = await geminiResponse.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log("Resposta bruta da Gemini:", result.candidates?.[0]?.content?.parts?.[0]?.text);

    const cleaned = text.replace(/^```json\n/, '').replace(/\n```$/, '');


    try {
      // Tenta fazer o parse da resposta como JSON
      // A Gemini deve retornar um JSON válido dada a instrução no prompt
      return res.json(JSON.parse(cleaned));
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