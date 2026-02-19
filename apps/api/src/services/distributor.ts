// ============================================
// EMAIL (via SendGrid)
// ============================================

async function sendEmail(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.email) {
    return { target, success: false, error: 'Missing email' };
  }

  const sendGridApiKey = process.env.SENDGRID_API_KEY;

  if (!sendGridApiKey) {
    return {
      target,
      success: false,
      error: 'SENDGRID_API_KEY not configured',
    };
  }

  const audienceLabel =
    target.audience === 'stakeholder'
      ? 'Stakeholder Brief'
      : target.audience === 'developer'
        ? 'Developer Notes'
        : 'Release Notes';

  // SendGrid v3 Mail Send structure
  const emailPayload = {
    personalizations: [
      {
        to: [{ email: target.email }],
        subject: `[${payload.repoFullName}] ${payload.tagName} - ${audienceLabel}`,
      },
    ],
    from: { email: 'noreply@negativezeroinc.com', name: 'ShipLog' },
    content: [
      {
        type: 'text/html',
        value: markdownToHtml(notes, payload),
      },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendGridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (response.ok) {
    return {
      target,
      success: true,
      responseCode: response.status,
    };
  }

  const responseData = await response.text();
  return {
    target,
    success: false,
    responseCode: response.status,
    error: responseData || 'SendGrid API error',
  };
}
