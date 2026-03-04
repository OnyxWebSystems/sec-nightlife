import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keywords, venue_type, amenities, music_genres, atmosphere } = await req.json();

    const prompt = `Generate a compelling and professional venue description for a ${venue_type} with the following characteristics:

Keywords: ${keywords || 'upscale, modern'}
Amenities: ${amenities?.join(', ') || 'N/A'}
Music Genres: ${music_genres?.join(', ') || 'N/A'}
Atmosphere: ${atmosphere || 'vibrant and energetic'}

Create a description that:
- Is 2-3 paragraphs long
- Highlights unique features and ambiance
- Appeals to the target audience
- Is engaging and professional
- Captures the essence of the nightlife experience

Return only the description text, no additional formatting.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: prompt
    });

    return Response.json({ 
      description: result,
      success: true 
    });
  } catch (error) {
    console.error('Error generating description:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});