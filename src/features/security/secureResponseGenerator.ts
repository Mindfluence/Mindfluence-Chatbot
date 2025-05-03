/**
 * secureResponseGenerator.ts
 * 
 * This module orchestrates the secure response generation process for the Mindfluence Chatbot.
 * It coordinates between the NLP engine's response generation and the security filtering
 * to ensure that users only receive information they are authorized to access.
 * 
 * The module takes the results of NLP processing and the user context,
 * generates a candidate response, applies necessary security checks and filters,
 * and returns the final, secure response.
 */

import { generateResponse } from '@/features/nlp-engine/pipelines/response-generation';
import { filterResponse } from './responseFilter';
import type { PermissionAwareContextData } from './permissionAwareContext';
import type { NLPProcessingResult } from '@/types/nlp.types';

// Lokale Definition anstatt auf nicht-exportiertes RESPONSE_REGISTRY zuzugreifen
const DEFAULT_FALLBACKS = {
  de: "Entschuldigung, es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später noch einmal.",
  en: "Sorry, an unexpected error occurred. Please try again later.",
};

/**
 * Gets a fallback message in the specified language when errors occur
 * 
 * @param language - The language code for the fallback message
 * @returns A fallback error message in the requested language
 */
function getFallbackMessage(language: string = 'de'): string {
  // Direkt auf die lokalen Fallbacks zugreifen
  return DEFAULT_FALLBACKS[language as keyof typeof DEFAULT_FALLBACKS] || DEFAULT_FALLBACKS.en;
}

/**
 * Generates a secure, filtered response based on NLP processing results and user context
 * 
 * This function orchestrates the entire secure response generation process:
 * 1. Generates a candidate response using the NLP engine
 * 2. Applies security filtering based on user permissions and privacy rules
 * 3. Returns the final, secure response
 * 
 * @param nlpResult - The result of NLP processing of the user's query
 * @param userContext - Context containing user permissions and authentication status
 * @returns A secure, filtered response that is safe to show to the user
 */
export async function generateSecureResponse(
  nlpResult: NLPProcessingResult,
  userContext: PermissionAwareContextData | null
): Promise<string> {
  // Determine language for potential fallback messages
  const language = 'de'; // Default language ist Deutsch
  
  try {
    // Step 1: Generate candidate response (potentially insecure)
    // Angepasster Aufruf: nur die erforderlichen Parameter übergeben
    const candidateResponse = await generateResponse(
      nlpResult,
      language // nur die ersten zwei Parameter
    );
    
    // Log the candidate response for debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.debug('Candidate response before security filtering:', candidateResponse);
    }
    
    // Step 2: Apply security filters to candidate response
    // Nutze ein Wrapper-Objekt für den userContext
    const contextWrapper = userContext ? { userAuthData: userContext } : { userAuthData: null };
    const finalSecureResponse = await filterResponse(
      candidateResponse,
      contextWrapper
    );
    
    // Step 3: Return the final, secure response
    return finalSecureResponse;
  } catch (error) {
    // Log the error for troubleshooting
    console.error("Error during secure response generation:", error);
    
    // Return a safe fallback message
    return getFallbackMessage(language);
  }
}

/**
 * Generates a secure response with additional logging and tracing for debugging
 * 
 * This version adds more extensive logging and is intended for development and debugging.
 * It should not be used in production as it may log sensitive information.
 * 
 * @param nlpResult - The result of NLP processing of the user's query
 * @param userContext - Context containing user permissions and authentication status
 * @param requestId - Unique identifier for the request for tracing
 * @returns A secure, filtered response with additional diagnostic information
 */
export async function generateSecureResponseWithDebugInfo(
  nlpResult: NLPProcessingResult,
  userContext: PermissionAwareContextData | null,
  requestId: string
): Promise<{
  response: string;
  debugInfo: {
    requestId: string;
    processingTime: number;
    generationSuccessful: boolean;
    filteringApplied: boolean;
    error?: string;
  };
}> {
  const startTime = Date.now();
  const language = 'de'; // Default language
  let generationSuccessful = false;
  let filteringApplied = false;
  let candidateResponse = '';
  let finalResponse = '';
  let error = undefined;
  
  try {
    // Step 1: Generate candidate response
    // Angepasster Aufruf: nur die erforderlichen Parameter übergeben
    candidateResponse = await generateResponse(
      nlpResult,
      language // nur die ersten zwei Parameter
    );
    generationSuccessful = true;
    
    // Step 2: Apply security filters
    // Nutze ein Wrapper-Objekt für den userContext
    const contextWrapper = userContext ? { userAuthData: userContext } : { userAuthData: null };
    finalResponse = await filterResponse(
      candidateResponse,
      contextWrapper
    );
    filteringApplied = true;
    
    return {
      response: finalResponse,
      debugInfo: {
        requestId,
        processingTime: Date.now() - startTime,
        generationSuccessful,
        filteringApplied
      }
    };
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${requestId}] Error during secure response generation:`, err);
    
    return {
      response: getFallbackMessage(language),
      debugInfo: {
        requestId,
        processingTime: Date.now() - startTime,
        generationSuccessful,
        filteringApplied,
        error
      }
    };
  }
}