// Only fixed messages may cross the API/log boundary; provider text can contain private inputs.
export function evaluationFailure(error) {
  const status = error?.providerStatus;
  if (status === 429)
    return 'The AI usage limit was reached. Saved scores are safe. Wait a minute, then retry.';
  if (status === 402)
    return 'The AI provider reports insufficient credit. Check the provider balance, then retry.';
  if (status === 401 || status === 403)
    return 'The AI provider rejected access. Ask the administrator to check the API key and model permissions.';
  if (status === 400 || status === 404)
    return 'The AI provider rejected the model or request format. Ask the administrator to check the provider settings.';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
    return 'The AI provider took too long to respond. Saved scores are safe. Please retry later.';
  if (error?.code === 'AI_INVALID_RESPONSE')
    return 'The AI provider returned an incomplete or invalid score. Saved scores are safe. Please retry.';
  return 'AI evaluation was unavailable. Saved scores are safe. Please retry.';
}
