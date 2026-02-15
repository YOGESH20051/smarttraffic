
import { GoogleGenAI } from "@google/genai";
import { SimulationStats, Intersection, LocationConfig } from "../types";

export interface AiAuditResponse {
  text: string;
  groundingChunks?: any[];
}

export const getTrafficInsights = async (
  stats: SimulationStats, 
  intersections: Intersection[],
  location: LocationConfig
): Promise<AiAuditResponse | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze this urban traffic simulation for ${location.name}, Tamil Nadu, India.
    Current Grid Stats: ${JSON.stringify({
      activeVehicles: stats.activeVehicles,
      congestion: (stats.congestionLevel * 100).toFixed(1) + "%",
      throughput: stats.totalThroughput
    })}
    
    Context: ${location.description}
    
    Tasks:
    1. Identify nearby police stations and emergency units in ${location.name}.
    2. Provide a brief analysis of the current traffic flow efficiency in this specific urban cluster.
    3. Recommend localized timing adjustments for the ${location.name} road network.
    
    Mention specific local landmarks relevant to ${location.name}.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: location.lat,
              longitude: location.lng
            }
          }
        },
      }
    });

    return {
      text: response.text || "",
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error(`Gemini ${location.name} Analysis Error:`, error);
    return null;
  }
};
