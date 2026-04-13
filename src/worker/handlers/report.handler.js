
export const reportHandler = async (job) => {
  console.log(" REPORT JOB STARTED");
  console.log("Data:", job.data);

  // simulate work
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log(" REPORT JOB DONE");
};