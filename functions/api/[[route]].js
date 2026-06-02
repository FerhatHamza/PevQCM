// Worker for QCM Application - ES Module format
// Deploy to: https://pevqcm-api.ferhathamza17.workers.dev/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Get admin password from environment
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'admin123'; // Fallback for development

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS request (CORS preflight)
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // API Routes
    try {
      // GET all questions (public)
      if (path === '/api/questions' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM questions ORDER BY id'
        ).all();
        
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET single question (public)
      if (path.match(/^\/api\/questions\/\d+$/) && method === 'GET') {
        const id = path.split('/').pop();
        const question = await env.DB.prepare(
          'SELECT * FROM questions WHERE id = ?'
        ).bind(id).first();
        
        if (!question) {
          return new Response(JSON.stringify({ error: 'Question not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        return new Response(JSON.stringify(question), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // POST new question (admin) - requires auth
      if (path === '/api/questions' && method === 'POST') {
        // Check authorization
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const body = await request.json();
        
        // Validate required fields
        if (!body.question || !body.options || body.correctIndex === undefined) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Validate options array
        if (!Array.isArray(body.options) || body.options.length !== 4) {
          return new Response(JSON.stringify({ error: 'Options must be an array of 4 items' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const options = JSON.stringify(body.options);
        
        const result = await env.DB.prepare(
          'INSERT INTO questions (question, options, correctIndex, explanation) VALUES (?, ?, ?, ?)'
        ).bind(body.question, options, body.correctIndex, body.explanation || '').run();
        
        const newQuestion = await env.DB.prepare(
          'SELECT * FROM questions WHERE id = ?'
        ).bind(result.meta.last_row_id).first();
        
        return new Response(JSON.stringify(newQuestion), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // PUT update question (admin) - requires auth
      if (path.match(/^\/api\/questions\/\d+$/) && method === 'PUT') {
        // Check authorization
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const id = path.split('/').pop();
        const body = await request.json();
        
        // Build update query dynamically
        let updates = [];
        let values = [];
        
        if (body.question) {
          updates.push('question = ?');
          values.push(body.question);
        }
        if (body.options) {
          if (!Array.isArray(body.options) || body.options.length !== 4) {
            return new Response(JSON.stringify({ error: 'Options must be an array of 4 items' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          updates.push('options = ?');
          values.push(JSON.stringify(body.options));
        }
        if (body.correctIndex !== undefined) {
          updates.push('correctIndex = ?');
          values.push(body.correctIndex);
        }
        if (body.explanation !== undefined) {
          updates.push('explanation = ?');
          values.push(body.explanation);
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        if (updates.length === 1) { // Only updated_at
          return new Response(JSON.stringify({ error: 'No fields to update' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        values.push(id);
        
        await env.DB.prepare(
          `UPDATE questions SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();
        
        const updatedQuestion = await env.DB.prepare(
          'SELECT * FROM questions WHERE id = ?'
        ).bind(id).first();
        
        return new Response(JSON.stringify(updatedQuestion), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DELETE question (admin) - requires auth
      if (path.match(/^\/api\/questions\/\d+$/) && method === 'DELETE') {
        // Check authorization
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const id = path.split('/').pop();
        
        await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // POST submit answer (public)
      if (path === '/api/submit' && method === 'POST') {
        const body = await request.json();
        const { questionId, selectedIndex } = body;
        
        if (questionId === undefined || selectedIndex === undefined) {
          return new Response(JSON.stringify({ error: 'Missing questionId or selectedIndex' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Get question to verify correct answer
        const question = await env.DB.prepare(
          'SELECT * FROM questions WHERE id = ?'
        ).bind(questionId).first();
        
        if (!question) {
          return new Response(JSON.stringify({ error: 'Question not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const isCorrect = selectedIndex === question.correctIndex;
        
        // Update counts
        if (isCorrect) {
          await env.DB.prepare(
            'UPDATE questions SET correct_count = correct_count + 1 WHERE id = ?'
          ).bind(questionId).run();
        } else {
          await env.DB.prepare(
            'UPDATE questions SET wrong_count = wrong_count + 1 WHERE id = ?'
          ).bind(questionId).run();
        }
        
        return new Response(JSON.stringify({
          correct: isCorrect,
          correctIndex: question.correctIndex,
          explanation: question.explanation
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET statistics (public)
      if (path === '/api/stats' && method === 'GET') {
        const stats = await env.DB.prepare(`
          SELECT 
            COUNT(*) as total_questions,
            SUM(correct_count) as total_correct,
            SUM(wrong_count) as total_wrong,
            AVG(CASE 
              WHEN (correct_count + wrong_count) > 0 
              THEN (correct_count * 100.0 / (correct_count + wrong_count)) 
              ELSE 0 
            END) as avg_success_rate
          FROM questions
        `).first();
        
        const questionsStats = await env.DB.prepare(`
          SELECT 
            id,
            question,
            correct_count,
            wrong_count,
            CASE 
              WHEN (correct_count + wrong_count) > 0 
              THEN ROUND(correct_count * 100.0 / (correct_count + wrong_count), 2)
              ELSE 0 
            END as success_rate
          FROM questions
          ORDER BY id
        `).all();
        
        return new Response(JSON.stringify({
          global: stats,
          questions: questionsStats.results
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET admin statistics with details (admin) - requires auth
      if (path === '/api/admin/stats' && method === 'GET') {
        // Check authorization
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const detailedStats = await env.DB.prepare(`
          SELECT 
            id,
            question,
            correct_count,
            wrong_count,
            (correct_count + wrong_count) as total_attempts,
            CASE 
              WHEN (correct_count + wrong_count) > 0 
              THEN ROUND(correct_count * 100.0 / (correct_count + wrong_count), 2)
              ELSE 0 
            END as success_rate,
            created_at,
            updated_at
          FROM questions
          ORDER BY total_attempts DESC, success_rate DESC
        `).all();
        
        return new Response(JSON.stringify(detailedStats.results), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ==================== LIVE SESSION ENDPOINTS ====================

      // Start a new live session (admin only)
      if (path === '/api/live/start' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
        }
        const sessionId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO live_sessions (id, active) VALUES (?, 1)').bind(sessionId).run();
        return new Response(JSON.stringify({ sessionId }), { status: 201, headers: corsHeaders });
      }

      // Get live session info (public)
      if (path === '/api/live/session' && method === 'GET') {
        const urlParams = new URL(request.url).searchParams;
        const sessionId = urlParams.get('sessionId');
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT * FROM live_sessions WHERE id = ? AND active = 1').bind(sessionId).first();
        if (!session) {
          return new Response(JSON.stringify({ error: 'Session not found or inactive' }), { status: 404, headers: corsHeaders });
        }
        // Return the current question (first unanswered? For simplicity, we'll serve all questions one by one based on responses)
        // We'll implement a simple index: the session keeps track of current question index (add column later)
        // For brevity, we'll just return the first question for now, and the audience will submit answers.
        // Better: session stores current_question_index. We'll add a column.
        return new Response(JSON.stringify({ sessionId, active: true }), { headers: corsHeaders });
      }

      // Get current question for a live session
      if (path === '/api/live/current-question' && method === 'GET') {
        const urlParams = new URL(request.url).searchParams;
        const sessionId = urlParams.get('sessionId');
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400, headers: corsHeaders });
        }
        // Count how many responses already submitted for this session
        const { count } = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM session_responses WHERE session_id = ?'
        ).bind(sessionId).first();
        const currentIndex = count; // each response moves to next question
        const allQuestions = await env.DB.prepare('SELECT * FROM questions ORDER BY id').all();
        if (currentIndex >= allQuestions.results.length) {
          return new Response(JSON.stringify({ finished: true }), { headers: corsHeaders });
        }
        const currentQuestion = allQuestions.results[currentIndex];
        currentQuestion.options = JSON.parse(currentQuestion.options);
        return new Response(JSON.stringify({ currentQuestion, questionNumber: currentIndex + 1, total: allQuestions.results.length }), { headers: corsHeaders });
      }

      // Submit an answer from audience (public)
      if (path === '/api/live/submit' && method === 'POST') {
        const body = await request.json();
        const { sessionId, questionId, selectedOption } = body;
        if (!sessionId || !questionId || selectedOption === undefined) {
          return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
        }
        // Check session is still active
        const session = await env.DB.prepare('SELECT * FROM live_sessions WHERE id = ? AND active = 1').bind(sessionId).first();
        if (!session) {
          return new Response(JSON.stringify({ error: 'Session not active' }), { status: 400, headers: corsHeaders });
        }
        // Insert response
        await env.DB.prepare(
          'INSERT INTO session_responses (session_id, question_id, selected_option) VALUES (?, ?, ?)'
        ).bind(sessionId, questionId, selectedOption).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Get live results for admin (polled)
      if (path === '/api/live/results' && method === 'GET') {
        const urlParams = new URL(request.url).searchParams;
        const sessionId = urlParams.get('sessionId');
        if (!sessionId) {
          return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400, headers: corsHeaders });
        }
        // Get all questions
        const questionsRes = await env.DB.prepare('SELECT * FROM questions ORDER BY id').all();
        const questions = questionsRes.results.map(q => ({ ...q, options: JSON.parse(q.options) }));
        // For each question, count responses for this session
        const stats = [];
        for (const q of questions) {
          const counts = await env.DB.prepare(
            `SELECT selected_option, COUNT(*) as count 
            FROM session_responses 
            WHERE session_id = ? AND question_id = ? 
            GROUP BY selected_option`
          ).bind(sessionId, q.id).all();
          const optionCounts = new Array(4).fill(0);
          counts.results.forEach(row => { optionCounts[row.selected_option] = row.count; });
          stats.push({ questionId: q.id, questionText: q.question, options: q.options, counts: optionCounts });
        }
        // Also get overall progress (how many users? For simplicity, we return total responses per question)
        return new Response(JSON.stringify({ stats, sessionId }), { headers: corsHeaders });
      }

      // End a live session (admin only)
      if (path === '/api/live/end' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
        }
        const body = await request.json();
        const { sessionId } = body;
        await env.DB.prepare('UPDATE live_sessions SET active = 0 WHERE id = ?').bind(sessionId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }


      // Not found
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};
