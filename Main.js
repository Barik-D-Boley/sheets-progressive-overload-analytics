function onEdit(e) {
  if (!e || !e.range) return;

  compileWorkoutData(e);
  newWorkout(e);
  replaceDropdowns(e);
  searchExercises(e);
  // Add an autofill function for exercises added so it's easy to see the last weight I did
  // Add a "Last updated" cell above the "update data" cell
}