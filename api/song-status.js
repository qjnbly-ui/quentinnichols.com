export default async function handler(req, res) {
  const task_id = req.query.task_id;

  const response = await fetch(`https://api.sonauto.ai/v1/generations/${task_id}`, {
    headers: {
      Authorization: `Bearer ${process.env.SONAUTO_API_KEY}`,
    },
  });

  const data = await response.json();

  res.status(200).json(data);
}
