import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { venue_id, event_id } = await req.json();

    // Fetch reviews
    const query = venue_id ? { venue_id } : { event_id };
    const reviews = await base44.asServiceRole.entities.Review.filter(query);

    if (reviews.length === 0) {
      return Response.json({ 
        message: 'No reviews available yet',
        success: true,
        insights: null
      });
    }

    const reviewTexts = reviews.map(r => r.review_text).filter(Boolean).join('\n\n');
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze the following customer reviews and provide actionable insights:

${reviewTexts}

Average Rating: ${avgRating.toFixed(1)}/5
Total Reviews: ${reviews.length}

Provide:
1. Common positive themes (max 3)
2. Common negative themes/concerns (max 3)
3. Top 3 actionable recommendations for improvement
4. Overall sentiment summary (1 paragraph)`,
      response_json_schema: {
        type: "object",
        properties: {
          positive_themes: {
            type: "array",
            items: { type: "string" }
          },
          negative_themes: {
            type: "array",
            items: { type: "string" }
          },
          recommendations: {
            type: "array",
            items: { type: "string" }
          },
          sentiment_summary: { type: "string" }
        }
      }
    });

    return Response.json({ 
      insights: result,
      stats: {
        total_reviews: reviews.length,
        average_rating: avgRating,
        rating_breakdown: {
          5: reviews.filter(r => r.rating === 5).length,
          4: reviews.filter(r => r.rating === 4).length,
          3: reviews.filter(r => r.rating === 3).length,
          2: reviews.filter(r => r.rating === 2).length,
          1: reviews.filter(r => r.rating === 1).length
        }
      },
      success: true 
    });
  } catch (error) {
    console.error('Error analyzing feedback:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});