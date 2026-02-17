
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  // Helper for responses
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

  try {
    // 1. GET ALL QUESTIONS
    if (request.method === 'GET' && path === 'questions') {
      const { results } = await env.DB.prepare("SELECT * FROM questions ORDER BY id DESC").all();
      // Parse options JSON strings back to arrays
      const formatted = results.map(q => ({ ...q, options: JSON.parse(q.options) }));
      return jsonResponse(formatted);
    }

    // 2. SUBMIT ANSWER (Updates Stats)
    if (request.method === 'POST' && path === 'submit') {
      const { id, isCorrect } = await request.json();
      if (isCorrect) {
        await env.DB.prepare("UPDATE questions SET correct_count = correct_count + 1 WHERE id = ?").bind(id).run();
      } else {
        await env.DB.prepare("UPDATE questions SET wrong_count = wrong_count + 1 WHERE id = ?").bind(id).run();
      }
      return jsonResponse({ success: true });
    }

    // 3. ADMIN: CREATE QUESTION
    if (request.method === 'POST' && path === 'admin/create') {
      const data = await request.json();
      await env.DB.prepare(
        "INSERT INTO questions (question, options, correctIndex, explanation) VALUES (?, ?, ?, ?)"
      ).bind(data.question, JSON.stringify(data.options), data.correctIndex, data.explanation).run();
      return jsonResponse({ success: true });
    }

    // 4. ADMIN: DELETE QUESTION
    if (request.method === 'DELETE' && path.startsWith('admin/delete/')) {
      const id = path.split('/').pop();
      await env.DB.prepare("DELETE FROM questions WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Not Found' }, 404);

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
