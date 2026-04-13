
export const emailHandler = async (job) => {
  console.log(" EMAIL JOB STARTED");
  console.log("Data:", job.data);

  // simulate work
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(" EMAIL JOB DONE");
};