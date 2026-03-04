import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event_type, target_audience, season, budget_level } = await req.json();

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate 3 creative promotion ideas for a ${event_type} event targeting ${target_audience} during ${season}. Budget level: ${budget_level}.

Each promotion should include:
- A catchy title
- Brief description (1-2 sentences)
- Target demographic
- Expected impact

Make them creative, practical, and tailored to nightlife/entertainment venues.`,
      response_json_schema: {
        type: "object",
        properties: {
          promotions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                target: { type: "string" },
                impact: { type: "string" }
              }
            }
          }
        }
      }
    });

    return Response.json({ 
      promotions: result.promotions,
      success: true 
    });
  } catch (error) {
    console.error('Error generating promotions:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});