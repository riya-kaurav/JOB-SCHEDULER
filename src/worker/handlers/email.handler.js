
export const emailHandler = async (job) => {
  console.log("EMAIL JOB STARTED");
  console.log("Data:", job.data);

  // 🔴 TEST MODE: force failure if payload says so
  if (job.data.payload?.fail === true) {
    console.log("Forcing failure for testing...");
    throw new Error("Intentional failure");
  }

  // simulate work
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("EMAIL JOB DONE");
};